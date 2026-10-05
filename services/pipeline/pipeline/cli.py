"""Command-line interface. Heavy imports (torch, transformers, psycopg) are deferred
into each command so `generate-demo` runs with a plain Python install."""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DEMO_OUT = PIPELINE_DIR / "data" / "generated"


def _cmd_generate_demo(args: argparse.Namespace) -> int:
    from pipeline.providers.demo.generator import write

    meta = write(Path(args.out), seed=args.seed, end_date=date.fromisoformat(args.end_date))
    print(f"Generated {meta['reviews']} demo reviews (seed={meta['seed']}, end={meta['end_date']}, sha={meta['sha256_16']}) → {args.out}")
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    from pipeline.run import run_pipeline

    return run_pipeline(provider=args.provider, competitor=args.competitor, csv_path=args.csv, market_slug=args.market,
                        workspace_slug=args.workspace, limit=args.limit, skip_topics=args.skip_topics,
                        mapping=args.mapping, spot_check=args.spot_check)


def _cmd_collect(args: argparse.Namespace) -> int:
    from pipeline.providers.google_play import collect_to_db

    return collect_to_db(cap=args.cap, competitor=args.competitor, workspace_slug=args.workspace, delay=args.delay)


def _cmd_eval(args: argparse.Namespace) -> int:
    from pipeline.eval.evaluate import main as eval_main

    return eval_main(gold_path=Path(args.gold), synthetic=args.synthetic, out=Path(args.out) if args.out else None)


def _cmd_sample_gold(args: argparse.Namespace) -> int:
    from pipeline.eval.sample import sample_gold

    return sample_gold(n=args.n, out=Path(args.out), market_slug=args.market)


def _cmd_label(args: argparse.Namespace) -> int:
    from pipeline.eval.labeler import run_labeler

    return run_labeler(Path(args.file))


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # emojis on Windows consoles
    p = argparse.ArgumentParser(prog="python -m pipeline", description="RivalSense NLP batch pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate-demo", help="write the synthetic demo dataset (JSONL) — stdlib only")
    g.add_argument("--out", default=str(DEFAULT_DEMO_OUT))
    g.add_argument("--seed", type=int, default=20261005)
    g.add_argument("--end-date", default="2026-09-30")
    g.set_defaults(fn=_cmd_generate_demo)

    r = sub.add_parser("run", help="run the analysis pipeline for one market")
    r.add_argument("--provider", choices=["demo", "csv", "google_play", "db"], required=True,
                   help="db = analyse reviews already stored for --market (no collection)")
    r.add_argument("--competitor", help="only ingest this competitor slug (analysis still covers the whole market)")
    r.add_argument("--csv", help="CSV file for --provider csv")
    r.add_argument("--mapping", help="JSON column mapping for --provider csv (see docs/PIPELINE.md)")
    r.add_argument("--market", help="market slug (defaults per provider)")
    r.add_argument("--workspace", default="demo", help="workspace slug that owns the market")
    r.add_argument("--limit", type=int, help="analyse at most N reviews (quick smoke runs)")
    r.add_argument("--skip-topics", action="store_true", help="skip topic discovery")
    r.add_argument("--spot-check", type=int, default=15, help="print N random analysed reviews at the end")
    r.set_defaults(fn=_cmd_run)

    c = sub.add_parser("collect", help="collect public Google Play reviews into the live market (no analysis)")
    c.add_argument("--cap", type=int, default=2000, help="max reviews per app (default 2000)")
    c.add_argument("--competitor", help="only this competitor slug")
    c.add_argument("--workspace", default="demo")
    c.add_argument("--delay", type=float, default=2.0, help="seconds between requests")
    c.set_defaults(fn=_cmd_collect)

    e = sub.add_parser("eval", help="evaluate against the gold set and write docs/EVALUATION.md")
    e.add_argument("--gold", default=str(PIPELINE_DIR / "eval" / "gold.csv"))
    e.add_argument("--synthetic", action="store_true", help="sanity check against the demo ground truth instead")
    e.add_argument("--out", help="markdown output path (default docs/EVALUATION.md)")
    e.set_defaults(fn=_cmd_eval)

    s = sub.add_parser("sample-gold", help="sample real reviews (stratified) into a CSV for hand labelling")
    s.add_argument("--n", type=int, default=200)
    s.add_argument("--market", default="quick-commerce-live")
    s.add_argument("--out", default=str(PIPELINE_DIR / "eval" / "gold.csv"))
    s.set_defaults(fn=_cmd_sample_gold)

    lb = sub.add_parser("label", help="interactive labelling helper for the gold set")
    lb.add_argument("--file", default=str(PIPELINE_DIR / "eval" / "gold.csv"))
    lb.set_defaults(fn=_cmd_label)

    args = p.parse_args(argv)
    return args.fn(args)
