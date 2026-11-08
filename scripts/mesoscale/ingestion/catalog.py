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
    required_types = {"schemaVersion": int, "model": dict, "cycleTime": str, "status": str, "receivedAt": str, "processedAt": str, "ageMinutes": int, "processingVersion": str, "domain": dict, "frames": list}
    if not isinstance(catalog, dict):
        raise ValueError("catalog missing required v1 fields")
    validate_required_types(catalog, required_types)
    validate_catalog_version(catalog["schemaVersion"])
    validate_catalog_status(catalog["status"])
    if not catalog["frames"]:
        raise ValueError("catalog frames must be a non-empty array")


def validate_required_types(catalog: dict, required_types: dict[str, type]) -> None:
    missing = required_types.keys() - catalog.keys()
    if missing:
        raise ValueError(f"catalog missing required v1 fields: {sorted(missing)}")
    invalid = [key for key, value_type in required_types.items() if type(catalog[key]) is not value_type]
    if invalid:
        raise ValueError(f"catalog fields have invalid types: {invalid}")


def validate_catalog_version(version: int) -> None:
    if version != 1:
        raise ValueError("invalid catalog schema version")


def validate_catalog_status(status: str) -> None:
    if status not in {"complete", "partial", "failed"}:
        raise ValueError("invalid catalog status")


def validate_frame_types(catalog: dict) -> None:
    if any(frame["frameType"] != frame_type(frame["forecastHour"]) for frame in catalog["frames"]):
        raise ValueError("frame type must agree with forecast hour")


def frame_type(forecast_hour: int) -> str:
    return "analysis" if forecast_hour == 0 else "forecast"
