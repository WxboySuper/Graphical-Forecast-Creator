"""Mesoscale ingest discovery responsibilities."""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from inventory import parse_idx, resolve_ranges

from .fields import Model, required_identities, RETRIES, RETRY_BASE_SECONDS


@dataclass(frozen=True)
class ResponseInfo:
    status: int
    headers: object


class SourceNotReady(RuntimeError):
    """The requested NOAA frame has not been published yet."""


@dataclass(frozen=True)
class FrameSource:
    forecast_hour: int
    url: str
    modified: str


@dataclass(frozen=True)
class FrameDiscovery:
    frames: tuple[FrameSource, ...]
    missing_hours: tuple[int, ...]


@dataclass(frozen=True)
class CycleSource:
    cycle: datetime
    analysis: FrameSource
    frames: tuple[FrameSource, ...]
    missing_hours: tuple[int, ...]
    already_published: bool = False


def request(url: str, headers: dict[str, str] | None = None, attempts: int = RETRIES, method: str = "GET") -> tuple[bytes, object]:
    error = None
    for attempt in range(attempts):
        try:
            return request_once(url, headers, method)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            check_retryable(exc, url)
            error = exc
            wait_before_retry(attempt, attempts)
    raise RuntimeError(f"request failed after {attempts} attempts: {url}: {error}")


def wait_before_retry(attempt: int, attempts: int) -> None:
    if attempt + 1 < attempts:
        time.sleep(RETRY_BASE_SECONDS * 2**attempt)


def check_retryable(error: Exception, url: str) -> None:
    if is_permanent_http_error(error):
        if error.code == 404:
            raise SourceNotReady(f"NOAA frame is not available yet: {url}") from error
        raise RuntimeError(f"NOAA object unavailable ({error.code}): {url}") from error


def is_permanent_http_error(error: Exception) -> bool:
    return isinstance(error, urllib.error.HTTPError) and 400 <= error.code < 500 and error.code != 429


def request_once(url: str, headers: dict[str, str] | None, method: str) -> tuple[bytes, object]:
    req = urllib.request.Request(url, headers={"User-Agent": "GFC-mesoscale-ingest/1.0", **(headers or {})}, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read(), ResponseInfo(response.status, response.headers)


def discover_cycle(model: Model, now: datetime | None = None, lookback_hours: int = 30, is_published=None) -> CycleSource:
    """Return newest cycle with all frames, or newest f00 while forecasts are pending."""
    now = now or datetime.now(UTC)
    base = now.replace(minute=0, second=0, microsecond=0)
    partial = None
    for age in range(lookback_hours):
        cycle = base - timedelta(hours=age)
        candidate = discover_cycle_candidate(model, cycle, is_published)
        if candidate is None:
            continue
        if not candidate.missing_hours:
            return candidate
        if partial is None:
            partial = candidate
    if partial is not None:
        return partial
    raise RuntimeError(f"No complete {model.id} f00 cycle found in the last {lookback_hours} hours")


def discover_cycle_candidate(model: Model, cycle: datetime, is_published=None):
    if cycle.hour % model.cadence:
        return None
    try:
        analysis = discover_frame(model, cycle, 0)
        if analysis is None:
            return None
        if is_published and is_published(cycle):
            return CycleSource(cycle, analysis, (), (), True)
        frames = discover_frames(model, cycle, analysis)
        return CycleSource(cycle, analysis, frames.frames, frames.missing_hours)
    except (RuntimeError, urllib.error.HTTPError, urllib.error.URLError, KeyError, ValueError):
        return None


def complete_index(index: bytes, size: int, model_id: str) -> bool:
    rows = parse_idx(index.decode("ascii"))
    actual = resolve_ranges(rows, size)
    return all(identity_present(group, actual) for group in required_identities(model_id))


def identity_present(group: list[dict[str, str]], actual: list) -> bool:
    return any(any(row.parameter == candidate["parameter"] and row.level == candidate["level"] for row, _ in actual) for candidate in group)


def expected_hours(model: Model) -> tuple[int, ...]:
    return tuple(range(7)) if model.id == "hrrr" else (0,)


def discover_frames(model: Model, cycle: datetime, analysis: FrameSource) -> FrameDiscovery:
    frames, missing = [], []
    for hour in expected_hours(model):
        frame = analysis if hour == 0 else discover_frame(model, cycle, hour)
        if frame is None:
            missing.append(hour)
        else:
            frames.append(frame)
    return FrameDiscovery(tuple(frames), tuple(missing))


def discover_frame(model: Model, cycle: datetime, hour: int) -> FrameSource | None:
    date, cycle_hour = cycle.strftime("%Y%m%d"), cycle.strftime("%H")
    object_key = model.path.format(date=date, hour=cycle_hour, fh=hour)
    root = f"https://{model.bucket}.s3.amazonaws.com/{object_key}"
    try:
        index, _ = request(f"{root}.idx")
        headers = {"User-Agent": "GFC-mesoscale-ingest/1.0"} if hour == 0 else None
        _, head = request(root, headers, method="HEAD")
    except SourceNotReady:
        return None
    if not complete_index(index, int(head.headers["Content-Length"]), model.id):
        return None
    return FrameSource(hour, root, head.headers.get("Last-Modified") or "")
