"""Mesoscale ingest discovery responsibilities."""

from __future__ import annotations

import argparse, hashlib, json, math, os, re, tempfile, time, urllib.error, urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

from inventory import IndexRecord, parse_idx, resolve_ranges

from .fields import Model, required_identities, RETRIES, RETRY_BASE_SECONDS
def request(url: str, headers: dict[str, str] | None = None, attempts: int = RETRIES) -> tuple[bytes, object]:
    error = None
    for attempt in range(attempts):
        try:
            return request_once(url, headers)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            fail_permanent_http_error(exc, url)
            error = exc
            if attempt + 1 < attempts:
                time.sleep(RETRY_BASE_SECONDS * 2**attempt)
    raise RuntimeError(f"request failed after {attempts} attempts: {url}: {error}")


def request_once(url: str, headers: dict[str, str] | None) -> tuple[bytes, object]:
    req = urllib.request.Request(url, headers={"User-Agent": "GFC-mesoscale-ingest/1.0", **(headers or {})})
    response = urllib.request.urlopen(req, timeout=30)
    return response.read(), response


def fail_permanent_http_error(error: Exception, url: str) -> None:
    if isinstance(error, urllib.error.HTTPError) and 400 <= error.code < 500 and error.code != 429:
        raise RuntimeError(f"NOAA object unavailable ({error.code}): {url}") from error

def discover_cycle(model: Model, now: datetime | None = None, lookback_hours: int = 30) -> tuple[datetime, str, str]:
    """Return newest f00 whose GRIB and index exist and whose index resolves all required fields."""
    now = now or datetime.now(UTC)
    base = now.replace(minute=0, second=0, microsecond=0)
    for age in range(lookback_hours):
        cycle = base - timedelta(hours=age)
        if cycle.hour % model.cadence:
            continue
        try:
            candidate = discover_candidate(model, cycle)
            if candidate:
                return candidate
        except (RuntimeError, urllib.error.HTTPError, urllib.error.URLError, KeyError, ValueError):
            continue
    raise RuntimeError(f"No complete {model.id} f00 cycle found in the last {lookback_hours} hours")


def discover_candidate(model: Model, cycle: datetime) -> tuple[datetime, str, str] | None:
    date, hour = cycle.strftime("%Y%m%d"), cycle.strftime("%H")
    object_key = model.path.format(date=date, hour=hour, fh=0)
    root = f"https://{model.bucket}.s3.amazonaws.com/{object_key}"
    idx, _ = request(f"{root}.idx")
    head = urllib.request.urlopen(urllib.request.Request(root, method="HEAD", headers={"User-Agent": "GFC-mesoscale-ingest/1.0"}), timeout=15)
    if complete_index(idx, int(head.headers["Content-Length"]), model.id):
        return cycle, root, head.headers.get("Last-Modified") or ""
    return None


def complete_index(index: bytes, size: int, model_id: str) -> bool:
    rows = parse_idx(index.decode("ascii"))
    actual = resolve_ranges(rows, size)
    return all(identity_present(group, actual) for group in required_identities(model_id))


def identity_present(group: list[dict[str, str]], actual: list) -> bool:
    return any(any(row.parameter == candidate["parameter"] and row.level == candidate["level"] for row, _ in actual) for candidate in group)
