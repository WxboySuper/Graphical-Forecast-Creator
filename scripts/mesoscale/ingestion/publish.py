"""Mesoscale ingest publish responsibilities."""

from __future__ import annotations

import warnings

import argparse, hashlib, json, math, os, re, tempfile, time, urllib.error, urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

from inventory import IndexRecord, parse_idx, resolve_ranges

from .catalog import validate_catalog
from .store import Store
from dataclasses import dataclass


@dataclass(frozen=True)
class PublishRequest:
    model_id: str
    cycle: datetime
    catalog: dict
    tile_files: dict[str, Path]
    keep: int = 6


def cycle_id(cycle: datetime) -> str:
    return cycle.strftime("%Y%m%dT%H00Z")


def catalog_key(model_id: str, cycle: datetime) -> str:
    return f"mesoscale/v1/catalog/{model_id}/{cycle_id(cycle)}.json"


def already_published(store: Store, model_id: str, cycle: datetime) -> bool:
    payload = store.get(catalog_key(model_id, cycle))
    return bool(payload and json.loads(payload).get("status") == "complete")


def latest_is_newer(store: Store, model_id: str, cycle: datetime) -> bool:
    current = store.get(f"mesoscale/v1/latest/{model_id}.json")
    if not current:
        return False
    current_cycle = datetime.fromisoformat(json.loads(current)["cycleTime"].replace("Z", "+00:00"))
    return current_cycle >= cycle


def upload_tiles(store: Store, request: PublishRequest) -> None:
    expected = {}
    for key, path in request.tile_files.items():
        content = path.read_bytes()
        checksum = hashlib.md5(content, usedforsecurity=False).hexdigest()
        receipt = store.put(key, content, "image/png")
        if receipt and receipt != checksum:
            raise IOError(f"published tile checksum mismatch: {key}")
        expected[key] = len(content)
    _verify_with_retries(store, expected)


def _verify_with_retries(store: Store, expected: dict[str, int]) -> None:
    error = None
    for attempt in range(3):
        try:
            store.verify_sizes(expected)
            return
        except (IOError, OSError) as exc:
            error = exc
            if attempt < 2:
                time.sleep(0.25 * (2**attempt))
    raise error


def publish_pointer(store: Store, model_id: str, cycle: datetime, catalog: dict) -> None:
    cycle_name = cycle_id(cycle)
    pointer = {"schemaVersion": 1, "modelId": model_id, "cycleTime": catalog["cycleTime"], "catalogUrl": f"/api/mesoscale/catalog/{model_id}/{cycle_name}.json", "publishedAt": catalog["processedAt"]}
    store.put(f"mesoscale/v1/latest/{model_id}.json", json.dumps(pointer, separators=(",", ":")).encode(), "application/json")
def publish_cycle(store: Store, request: PublishRequest) -> None:
    """Verify all tile objects before publishing catalog and latest pointer."""
    validate_catalog(request.catalog)
    if not complete_catalog(request.catalog):
        raise ValueError("partial or failed cycles cannot be published as latest")
    if skip_publication(store, request):
        return
    upload_tiles(store, request)
    store.put(catalog_key(request.model_id, request.cycle), json.dumps(request.catalog, separators=(",", ":")).encode(), "application/json")
    publish_pointer(store, request.model_id, request.cycle, request.catalog)
    retain_cycles(store, request)


def complete_catalog(catalog: dict) -> bool:
    return catalog["status"] == "complete"


def skip_publication(store: Store, request: PublishRequest) -> bool:
    if already_published(store, request.model_id, request.cycle):
        restore_pointer(store, request)
        return True
    return latest_is_newer(store, request.model_id, request.cycle)


def restore_pointer(store: Store, request: PublishRequest) -> None:
    if not latest_is_newer(store, request.model_id, request.cycle):
        publish_pointer(store, request.model_id, request.cycle, request.catalog)


def retain_cycles(store: Store, request: PublishRequest) -> None:
    try:
        prune_old_cycles(store, request)
    except Exception as error:
        warnings.warn(f"cycle published but retention cleanup failed: {error}", RuntimeWarning)


def prune_old_cycles(store: Store, request: PublishRequest) -> None:
    catalogs = sorted((key for key in store.list(f"mesoscale/v1/catalog/{request.model_id}") if key.endswith(".json")), reverse=True)
    for old_catalog in catalogs[request.keep:]:
        remove_cycle(store, request.model_id, old_catalog)


def remove_cycle(store: Store, model_id: str, catalog_key_name: str) -> None:
    old_id = Path(catalog_key_name).stem
    delete_old_tiles(store, model_id, old_id)
    store.delete(catalog_key_name)


def delete_old_tiles(store: Store, model_id: str, cycle_name: str) -> None:
    prefix = f"mesoscale/v1/tiles/{model_id}/{cycle_name}"
    for key in store.list(prefix):
        store.delete(key)
