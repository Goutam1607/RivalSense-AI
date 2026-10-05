"""Paths, environment, and analysis parameters (CLAUDE.md §5 thresholds live here)."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = PIPELINE_DIR.parent.parent
CACHE_DIR = PIPELINE_DIR / ".cache"
GENERATED_DIR = PIPELINE_DIR / "data" / "generated"
MARKET_CONFIG = REPO_ROOT / "config" / "markets" / "quick-commerce.json"


def load_env() -> None:
    """Load the repo-root .env (shared with the web app) without overriding real env vars."""
    try:
        from dotenv import load_dotenv
    except ImportError:  # generate-demo runs without third-party packages
        return
    load_dotenv(REPO_ROOT / ".env", override=False)


def configure_model_cache() -> None:
    """Keep Hugging Face downloads inside services/pipeline/.cache so the pipeline works offline afterwards."""
    os.environ.setdefault("HF_HOME", str(CACHE_DIR / "hf"))
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def database_url() -> str:
    load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set. Copy .env.example to .env in the repo root.")
    # psycopg does not understand Prisma's ?schema= parameter
    return url.split("?schema=")[0]


def market_config() -> dict:
    return json.loads(MARKET_CONFIG.read_text(encoding="utf-8"))


@dataclass(frozen=True)
class Models:
    overall_sentiment: str = "cardiffnlp/twitter-roberta-base-sentiment-latest"
    absa: str = "yangheng/deberta-v3-base-absa-v1.1"
    embeddings: str = "sentence-transformers/all-MiniLM-L6-v2"


@dataclass(frozen=True)
class Params:
    """Analysis thresholds. Defaults implement CLAUDE.md §5 exactly; see docs/METRICS.md."""

    min_sample: int = 30  # show a score only if mentions >= 30
    confidence_high_width: float = 10.0  # interval width (points) < 10 → High
    confidence_medium_width: float = 20.0  # 10–20 → Medium, > 20 → Low
    emerging_window_days: int = 30
    emerging_min_negative: int = 20
    emerging_min_relative_increase: float = 0.25
    emerging_alpha: float = 0.05
    gap_min_points: float = 10.0
    market_weakness_threshold: float = 55.0
    insight_window_days: int = 180  # window used for gaps, strengths/weaknesses and market weaknesses
    # App-version drop detection (extension beyond §5; Benjamini–Hochberg corrected, see METRICS.md)
    version_min_reviews: int = 30
    version_min_negative: int = 20
    version_min_relative_increase: float = 0.5
    version_fdr: float = 0.05
    # Aspect detection
    embedding_threshold: float = 0.65
    embedding_margin: float = 0.04  # best category must beat the runner-up by this much
    # Topic discovery
    topic_min_cluster_size: int = 12
    evidence_per_insight: int = 50

    def to_json(self) -> dict:
        return asdict(self)


MODELS = Models()
PARAMS = Params()
