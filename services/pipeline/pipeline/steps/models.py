"""Model wrappers: sentence embeddings, overall sentiment, aspect-based sentiment (ABSA).

* All inference is batched, sorted by length to minimise padding, and shows a progress bar.
* Results are cached on disk (SQLite in services/pipeline/.cache) keyed by model + revision + input,
  so re-running the pipeline on the same reviews is fast and fully offline.
"""

from __future__ import annotations

import hashlib
import logging
import os
import pickle
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pipeline.config import CACHE_DIR, MODELS, configure_model_cache

configure_model_cache()
log = logging.getLogger("pipeline.models")

LABELS = ("NEGATIVE", "NEUTRAL", "POSITIVE")


class DiskCache:
    """Tiny key → pickled value store. One table per namespace (model)."""

    def __init__(self, path: Path = CACHE_DIR / "inference.sqlite"):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._lock = threading.Lock()

    def _table(self, ns: str) -> str:
        t = "c_" + hashlib.sha1(ns.encode()).hexdigest()[:16]
        self._db.execute(f"CREATE TABLE IF NOT EXISTS {t} (k TEXT PRIMARY KEY, v BLOB)")
        return t

    @staticmethod
    def key(*parts: str) -> str:
        return hashlib.sha1("␟".join(parts).encode("utf-8")).hexdigest()

    def get_many(self, ns: str, keys: list[str]) -> dict[str, object]:
        t = self._table(ns)
        out: dict[str, object] = {}
        for i in range(0, len(keys), 500):
            chunk = keys[i : i + 500]
            q = f"SELECT k, v FROM {t} WHERE k IN ({','.join('?' * len(chunk))})"
            for k, v in self._db.execute(q, chunk):
                out[k] = pickle.loads(v)
        return out

    def put_many(self, ns: str, items: dict[str, object]) -> None:
        t = self._table(ns)
        with self._lock:
            self._db.executemany(f"INSERT OR REPLACE INTO {t} (k, v) VALUES (?, ?)",
                                 [(k, pickle.dumps(v, protocol=4)) for k, v in items.items()])
            self._db.commit()


_cache: DiskCache | None = None


def cache() -> DiskCache:
    global _cache
    if _cache is None:
        _cache = DiskCache()
    return _cache


def _torch():
    import torch

    torch.set_num_threads(max(1, (os.cpu_count() or 4) // 2))  # physical cores; hyper-threads slow BLAS down
    return torch


def _load_hf(repo: str, kind: str):
    """Load from the local cache first (offline); download once if missing."""
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    for local_only in (True, False):
        try:
            tok = AutoTokenizer.from_pretrained(repo, local_files_only=local_only)
            model = AutoModelForSequenceClassification.from_pretrained(repo, local_files_only=local_only)
            model.eval()
            return tok, model
        except OSError:
            if not local_only:
                raise
            log.info("Model %s not in local cache — downloading once (%s)", repo, kind)
    raise RuntimeError("unreachable")


def _revision(model) -> str:
    return str(getattr(model.config, "_commit_hash", None) or "unknown")


@dataclass
class SentimentResult:
    label: str  # NEGATIVE | NEUTRAL | POSITIVE
    confidence: float
    probs: tuple[float, float, float]  # negative, neutral, positive


def _progress(total: int, desc: str):
    from tqdm import tqdm

    return tqdm(total=total, desc=desc, unit="txt", dynamic_ncols=True, leave=True)


class _Classifier:
    """Shared batching/caching logic for sequence classifiers with neg/neu/pos labels."""

    repo: str
    max_length: int = 256
    batch_size: int = 32

    def __init__(self):
        self.tok, self.model = _load_hf(self.repo, type(self).__name__)
        self.revision = _revision(self.model)
        id2label = {int(k): v.upper() for k, v in self.model.config.id2label.items()}
        self.order = [next(i for i, l in id2label.items() if l.startswith(x[:3])) for x in LABELS]
        self.ns = f"{self.repo}@{self.revision}"

    def _encode(self, batch):
        raise NotImplementedError

    def _key(self, item) -> str:
        raise NotImplementedError

    def predict(self, items: list, desc: str) -> list[SentimentResult]:
        torch = _torch()
        keys = [self._key(it) for it in items]
        cached = cache().get_many(self.ns, list(set(keys)))
        todo = sorted({k: it for k, it in zip(keys, items) if k not in cached}.items(), key=lambda kv: len(str(kv[1])))
        new: dict[str, object] = {}
        if todo:
            bar = _progress(len(todo), desc)
            for i in range(0, len(todo), self.batch_size):
                chunk = todo[i : i + self.batch_size]
                with torch.inference_mode():
                    enc = self._encode([it for _, it in chunk])
                    probs = self.model(**enc).logits.softmax(-1).cpu().numpy()
                for (k, _), p in zip(chunk, probs):
                    new[k] = tuple(float(p[j]) for j in self.order)
                bar.update(len(chunk))
                if len(new) >= 2000:
                    cache().put_many(self.ns, new)
                    cached.update(new)
                    new = {}
            bar.close()
            cache().put_many(self.ns, new)
            cached.update(new)
        out = []
        for k in keys:
            p = cached[k]
            j = int(np.argmax(p))
            out.append(SentimentResult(LABELS[j], float(p[j]), p))  # type: ignore[arg-type]
        return out


class OverallSentiment(_Classifier):
    repo = MODELS.overall_sentiment
    max_length = 160  # app reviews are short; long ones are truncated (recorded in METRICS.md)

    def _key(self, text: str) -> str:
        return DiskCache.key(text)

    def _encode(self, texts: list[str]):
        return self.tok(texts, return_tensors="pt", padding=True, truncation=True, max_length=self.max_length)


class AspectSentiment(_Classifier):
    """ABSA: input is (clause text, aspect term)."""

    repo = MODELS.absa
    batch_size = 24
    max_length = 128  # input is a single clause + aspect term

    def _key(self, pair: tuple[str, str]) -> str:
        return DiskCache.key(pair[0], pair[1])

    def _encode(self, pairs: list[tuple[str, str]]):
        return self.tok([p[0] for p in pairs], [p[1] for p in pairs], return_tensors="pt", padding=True,
                        truncation=True, max_length=self.max_length)


class Embedder:
    repo = MODELS.embeddings

    def __init__(self):
        from sentence_transformers import SentenceTransformer

        try:
            self.model = SentenceTransformer(self.repo, device="cpu", local_files_only=True)
        except Exception:  # first run: download once
            self.model = SentenceTransformer(self.repo, device="cpu")
        self.revision = "unknown"
        try:
            from huggingface_hub import scan_cache_dir  # noqa: F401
            cfg = getattr(self.model[0].auto_model.config, "_commit_hash", None)
            self.revision = str(cfg or "unknown")
        except Exception:
            pass
        self.ns = f"{self.repo}@{self.revision}"

    def encode(self, texts: list[str], desc: str = "embeddings") -> np.ndarray:
        if not texts:
            return np.zeros((0, 384), dtype=np.float32)
        keys = [DiskCache.key(t) for t in texts]
        cached = cache().get_many(self.ns, list(set(keys)))
        missing = sorted({k: t for k, t in zip(keys, texts) if k not in cached}.items(), key=lambda kv: len(kv[1]))
        if missing:
            log.info("Embedding %d new texts (%d cached)", len(missing), len(texts) - len(missing))
            vecs = self.model.encode([t for _, t in missing], batch_size=64, show_progress_bar=len(missing) > 200,
                                     normalize_embeddings=True, convert_to_numpy=True)
            new = {k: v.astype(np.float32) for (k, _), v in zip(missing, vecs)}
            cache().put_many(self.ns, new)
            cached.update(new)
        return np.stack([cached[k] for k in keys]).astype(np.float32)
