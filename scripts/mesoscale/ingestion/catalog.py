"""Mesoscale ingest catalog responsibilities."""

from __future__ import annotations

import argparse, hashlib, json, math, os, re, tempfile, time, urllib.error, urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

from inventory import IndexRecord, parse_idx, resolve_ranges

SCHEMA_PATH = Path(__file__).parents[1] / "catalog.schema.json"


def validate_catalog(catalog: dict) -> None:
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError:
        validate_catalog_minimum(catalog)
    else:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(catalog))
        if errors:
            raise ValueError(f"invalid catalog: {errors[0].message}")
    validate_frame_types(catalog)


def validate_catalog_minimum(catalog: dict) -> None:
    required = {"schemaVersion", "model", "cycleTime", "status", "receivedAt", "processedAt", "ageMinutes", "processingVersion", "domain", "frames"}
    if not isinstance(catalog, dict) or not required.issubset(catalog):
        raise ValueError("catalog missing required v1 fields")
    if catalog["schemaVersion"] != 1 or catalog["status"] not in {"complete", "partial", "failed"}:
        raise ValueError("invalid catalog schema version or status")
    if not isinstance(catalog["frames"], list) or not catalog["frames"]:
        raise ValueError("catalog frames must be a non-empty array")


def validate_frame_types(catalog: dict) -> None:
    if any(frame["frameType"] != frame_type(frame["forecastHour"]) for frame in catalog["frames"]):
        raise ValueError("frame type must agree with forecast hour")


def frame_type(forecast_hour: int) -> str:
    return "analysis" if forecast_hour == 0 else "forecast"
