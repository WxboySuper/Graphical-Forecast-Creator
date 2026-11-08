"""Mesoscale ingest cli responsibilities."""

from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from .discovery import discover_cycle
from .fields import MODELS
from .health import HealthReport, write_health
from .publish import PublishRequest, already_published, publish_cycle, latest_is_newer, publish_pointer
from .render import CycleContext, process_frames
from .store import R2Credentials, R2Store


@dataclass(frozen=True)
class HealthContext:
    model_id: str
    cycle: datetime
    metrics: dict
    received_at: str
    status: str = "complete"


@dataclass(frozen=True)
class PipelineOutput:
    health: HealthContext
    result: dict | None


@dataclass(frozen=True)
class CycleRequest:
    args: argparse.Namespace
    model: object
    store: R2Store | None
    health: HealthContext
    url: str
    modified: str
    frames: tuple
    missing_hours: tuple[int, ...]
    already_published: bool = False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=MODELS, required=True)
    parser.add_argument("--output", type=Path, default=Path("build/mesoscale"))
    parser.add_argument("--dry-run", action="store_true", help="discover and render the model frames without R2 credentials")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    model = MODELS[args.model]
    store = None if args.dry_run else create_store()
    execute_pipeline(args, model, store)


def execute_pipeline(args, model, store) -> None:
    started = time.perf_counter()
    health = initial_health(model.id)
    try:
        is_published = lambda cycle: store is not None and already_published(store, model.id, cycle)
        source = discover_cycle(model, is_published=is_published)
    except Exception as error:
        record_failure(store, health, error)
        raise
    health = health_for_cycle(health, source.cycle)
    try:
        cycle_request = CycleRequest(args, model, store, health, source.analysis.url, source.analysis.modified, source.frames, source.missing_hours, source.already_published)
        output = run_cycle(cycle_request)
    except Exception as error:
        record_failure(store, health, error)
        raise
    finish_cycle(store, output)
    print(json.dumps({"model": model.id, "runtimeSeconds": round(time.perf_counter() - started, 2)}))


def finish_cycle(store, output: PipelineOutput) -> None:
    health = output.health
    try:
        publish_complete_result(store, health.model_id, health.cycle, output.result)
    except Exception as error:
        record_failure(store, health, error)
        raise
    if store is not None:
        write_success_health(store, output)


def run_cycle(request: CycleRequest) -> PipelineOutput:
    health, model, store = request.health, request.model, request.store
    if request.already_published:
        publish_pointer_if_missing(store, model.id, health.cycle)
        return PipelineOutput(health, None)
    if store is not None and already_published(store, model.id, health.cycle):
        publish_pointer_if_missing(store, model.id, health.cycle)
        return PipelineOutput(health, None)
    if request.missing_hours:
        metrics = {"framesComplete": len(request.frames), "framesFailed": 0, "tiles": 0, "bytesDownloaded": 0, "bytesPublished": 0, "archives": 0, "missingForecastHours": list(request.missing_hours)}
        partial = HealthContext(health.model_id, health.cycle, metrics, health.received_at, "partial")
        return PipelineOutput(partial, None)
    context = CycleContext(model, health.cycle, request.url, request.modified, request.args.output, request.frames)
    result = process_frames(context)
    health = health_for_result(health, result)
    return PipelineOutput(health, result)


def initial_health(model_id: str) -> HealthContext:
    cycle = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    received = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    return HealthContext(model_id, cycle, {}, received)


def health_for_cycle(health: HealthContext, cycle: datetime) -> HealthContext:
    return HealthContext(health.model_id, cycle, health.metrics, health.received_at)


def health_for_result(health: HealthContext, result: dict) -> HealthContext:
    return HealthContext(health.model_id, health.cycle, result["metrics"], health.received_at, result["catalog"]["status"])


def publish_complete_result(store, model_id: str, cycle: datetime, result: dict | None) -> None:
    if store is None:
        return
    if result is None:
        return
    if result["catalog"]["status"] != "complete":
        return
    publish_cycle(store, PublishRequest(model_id, cycle, result["catalog"], result["archives"]))


def write_success_health(store, output: PipelineOutput) -> None:
    health = output.health
    if output.result is None:
        report = HealthReport(health.model_id, health.cycle, health.status, health.metrics, health.received_at, current_time())
    else:
        catalog = output.result["catalog"]
        report = HealthReport(health.model_id, health.cycle, catalog["status"], health.metrics, catalog["receivedAt"], catalog["processedAt"])
    write_health(store, report)


def write_failed_health(store: R2Store, health: HealthContext, error: Exception) -> None:
    report = HealthReport(health.model_id, health.cycle, "failed", health.metrics, health.received_at, current_time(), f"{type(error).__name__}: {error}")
    try:
        write_health(store, report)
    except Exception as health_error:
        error.add_note(f"Failed to write failure health report: {type(health_error).__name__}: {health_error}")


def record_failure(store, health: HealthContext, error: Exception) -> None:
    if store is not None:
        write_failed_health(store, health, error)


def current_time() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


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
        publish_pointer(store, model_id, cycle, json.loads(payload))
