"""Mesoscale ingest cli responsibilities."""

from __future__ import annotations

import argparse, hashlib, json, math, os, re, tempfile, time, urllib.error, urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

from inventory import IndexRecord, parse_idx, resolve_ranges

from .fields import MODELS
from .discovery import discover_cycle
from .render import process_f00, CycleContext
from .store import R2Store, R2Credentials
from .publish import publish_cycle, PublishRequest, already_published, latest_is_newer, publish_pointer
from .health import write_health, HealthReport
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=MODELS, required=True)
    parser.add_argument("--output", type=Path, default=Path("build/mesoscale"))
    parser.add_argument("--dry-run", action="store_true", help="discover source and download/decode f00 without R2 credentials")
    return parser

def main() -> None:
    args = build_parser().parse_args()
    model = MODELS[args.model]
    store = None if args.dry_run else create_store()
    cycle = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    received_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    metrics = {}
    try:
        cycle, url, modified = discover_cycle(model)
        if store and already_published(store, model.id, cycle):
            publish_pointer_if_missing(store, model.id, cycle)
            report = HealthReport(model.id, cycle, "complete", metrics, received_at, datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"))
            write_health(store, report)
            return
        result = process_f00(CycleContext(model, cycle, url, modified, args.output))
        metrics = result["metrics"]
        if store:
            if result["catalog"]["status"] == "complete":
                publish_cycle(store, PublishRequest(model.id, cycle, result["catalog"], result["tiles"]))
            write_health(store, HealthReport(model.id, cycle, result["catalog"]["status"], metrics, result["catalog"]["receivedAt"], result["catalog"]["processedAt"]))
    except Exception as error:
        if store:
            now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
            write_health(store, HealthReport(model.id, cycle, "failed", metrics, received_at, now, f"{type(error).__name__}: {error}"))
        raise


def create_store() -> R2Store:
    account, bucket = os.getenv("R2_ACCOUNT_ID"), os.getenv("R2_BUCKET")
    access, secret = os.getenv("R2_ACCESS_KEY_ID"), os.getenv("R2_SECRET_ACCESS_KEY")
    if not all((account, bucket, access, secret)):
        raise RuntimeError("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required")
    return R2Store(R2Credentials(account, bucket, access, secret))


def publish_pointer_if_missing(store: R2Store, model_id: str, cycle: datetime) -> None:
    if latest_is_newer(store, model_id, cycle):
        return
    payload = store.get(f"mesoscale/v1/catalog/{model_id}/{cycle.strftime('%Y%m%dT%H00Z')}.json")
    if payload:
        from .publish import publish_pointer
        publish_pointer(store, model_id, cycle, json.loads(payload))
