"""Mesoscale ingest health responsibilities."""

from __future__ import annotations

import argparse, hashlib, json, math, os, re, tempfile, time, urllib.error, urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

from inventory import IndexRecord, parse_idx, resolve_ranges

from .store import Store
from .fields import Model


@dataclass(frozen=True)
class HealthReport:
    model_id: str
    cycle: datetime
    status: str
    metrics: dict
    received_at: str
    processed_at: str
    error: str | None = None


def write_health(store: Store, report: HealthReport) -> None:
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    cycle_text = report.cycle.strftime("%Y-%m-%dT%H:%M:%SZ")
    store.put(health_key(today, report.model_id), encode_health(report, cycle_text), "application/json")


def health_key(today: str, model_id: str) -> str:
    return f"mesoscale/v1/health/{today}/{model_id}.json"


def encode_health(report: HealthReport, cycle_text: str) -> bytes:
    health = {"schemaVersion": 1, "generatedAt": report.processed_at, "modelId": report.model_id, "expectedCycleTime": cycle_text, "latestAvailableCycleTime": cycle_text if report.status == "complete" else None, "status": report.status, "receivedAt": report.received_at, "processedAt": report.processed_at, "ageMinutes": max(0, int((datetime.now(UTC)-report.cycle).total_seconds() // 60)), "framesComplete": 1 if report.status == "complete" else 0, "framesFailed": 1 if report.status == "failed" else 0, "tilesWritten": report.metrics.get("tiles", 0), "bytesDownloaded": report.metrics.get("bytesDownloaded", 0), "bytesPublished": report.metrics.get("bytesPublished", 0), "error": report.error}
    return json.dumps(health, separators=(",", ":")).encode()
