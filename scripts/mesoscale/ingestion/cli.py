"""Mesoscale ingest cli responsibilities."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from .discovery import discover_cycle
from .fields import MODELS
from .health import HealthReport, write_health
from .publish import PublishRequest, already_published, publish_cycle, latest_is_newer, publish_pointer
from .render import CycleContext, process_f00
from .store import R2Credentials, R2Store


@dataclass(frozen=True)
class HealthContext:
    model_id: str
    cycle: datetime
    metrics: dict
    received_at: str


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
    execute_pipeline(args, model, store)


def execute_pipeline(args, model, store) -> None:
    health = initial_health(model.id)
    try:
        cycle, url, modified = discover_cycle(model)
    except Exception as error:
        record_failure(store, health, error)
        raise
    health = health_for_cycle(health, cycle)
    try:
        output = run_cycle(CycleRequest(args, model, store, health, url, modified))
    except Exception as error:
        record_failure(store, health, error)
        raise
    finish_cycle(store, output)


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
    if store is not None and already_published(store, model.id, health.cycle):
        publish_pointer_if_missing(store, model.id, health.cycle)
        return PipelineOutput(health, None)
    context = CycleContext(model, health.cycle, request.url, request.modified, request.args.output)
    result = process_f00(context)
    health = health_for_result(health, result)
    return PipelineOutput(health, result)


def initial_health(model_id: str) -> HealthContext:
    cycle = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    received = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    return HealthContext(model_id, cycle, {}, received)


def health_for_cycle(health: HealthContext, cycle: datetime) -> HealthContext:
    return HealthContext(health.model_id, cycle, health.metrics, health.received_at)


def health_for_result(health: HealthContext, result: dict) -> HealthContext:
    return HealthContext(health.model_id, health.cycle, result["metrics"], health.received_at)


def publish_complete_result(store, model_id: str, cycle: datetime, result: dict | None) -> None:
    if store is None:
        return
    if result is None:
        return
    if result["catalog"]["status"] != "complete":
        return
    publish_cycle(store, PublishRequest(model_id, cycle, result["catalog"], result["tiles"]))


def write_success_health(store, output: PipelineOutput) -> None:
    health = output.health
    if output.result is None:
        report = HealthReport(health.model_id, health.cycle, "complete", health.metrics, health.received_at, current_time())
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
