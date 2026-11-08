"""Small orchestration steps used by the f00 renderer."""

from __future__ import annotations

import hashlib
import json
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from inventory import parse_idx, resolve_ranges

from .fields import FIELDS, VERSION, ZOOM_MIN, ZOOM_MAX, Model, source_metadata
from .discovery import request


@dataclass(frozen=True)
class SourceBundle:
    object_size: int
    ranged: list
    by_offset: dict
    received: datetime


@dataclass(frozen=True)
class RenderResult:
    catalog: dict
    tiles: dict[str, Path]
    metrics: dict


@dataclass(frozen=True)
class ParameterBuild:
    context: object
    source: SourceBundle
    processed: datetime
    field_id: str
    item: dict
    spec: tuple
    descriptors: list


@dataclass(frozen=True)
class CatalogBuild:
    context: object
    source: SourceBundle
    parameters: list
    downloaded: int
    tile_count: int
    tile_bytes: int


def process(context, decode_range, render_tiles, combine_wind) -> RenderResult:
    import numpy as np
    source = load_source(context)
    fields, downloaded = decode_source(context, source, decode_range, np)
    params, tiles, tile_count, tile_bytes = render_fields(context, source, combine_wind(fields, np), render_tiles)
    catalog = build_catalog(CatalogBuild(context, source, params, downloaded, tile_count, tile_bytes))
    print(json.dumps({"model": context.model.id, "cycle": catalog["cycleTime"], "bytesDownloaded": downloaded, "tiles": tile_count, "tileBytes": tile_bytes, "fields": sorted(item["id"] for item in params), "missing": catalog["unavailableParameters"]}, indent=2))
    return RenderResult(catalog, tiles, catalog["metrics"])


def load_source(context) -> SourceBundle:
    idx, _ = request(f"{context.source_url}.idx")
    head = urllib.request.urlopen(urllib.request.Request(context.source_url, method="HEAD", headers={"User-Agent": "GFC-mesoscale-ingest/1.0"}), timeout=30)
    size = int(head.headers["Content-Length"])
    records = parse_idx(idx.decode("ascii"))
    selected = select_fields(context.model, records, size)
    ranged = resolve_ranges(records, size)
    received = received_time(context.modified)
    return SourceBundle(size, ranged, group_ranges(selected), received)


def select_fields(model: Model, records: list, size: int) -> dict:
    from inventory import resolve_allowlist
    identities = {f"{field_id}:{parameter}": {"parameter": parameter, "level": level_for_model(model, field_id, level)} for field_id, spec in FIELDS.items() for parameter, level in spec[0].items()}
    return resolve_allowlist(records, size, identities)


def level_for_model(model: Model, field_id: str, level: str) -> str:
    if model.id == "rrfs" and field_id == "reflectivity":
        return "entire atmosphere (considered as a single layer)"
    return level


def group_ranges(selected: dict) -> dict:
    grouped = {}
    for field_id, matches in selected.items():
        for match in matches:
            start, end = match["range"]["start"], match["range"]["end"]
            grouped.setdefault(start, (end, []))[1].append(field_id)
    return grouped


def received_time(modified: str) -> datetime:
    try:
        return datetime.strptime(modified, "%a, %d %b %Y %H:%M:%S %Z").replace(tzinfo=UTC)
    except ValueError:
        return datetime.now(UTC)


def decode_source(context, source: SourceBundle, decode_range, np) -> tuple[dict, int]:
    output, downloaded = {}, 0
    for offset, (end, field_ids) in source.by_offset.items():
        content = fetch_range(context.source_url, offset, end, source.object_size)
        downloaded += len(content)
        digest = hashlib.sha256(content).hexdigest()
        from .render import DecodeRequest
        decoded = decode_range(DecodeRequest(content, field_ids, offset, source.ranged, digest, np))
        for field_id, item in decoded:
            output.setdefault(field_id, []).append(item)
    return output, downloaded


def fetch_range(url: str, offset: int, end: int, size: int) -> bytes:
    data, response = request(url, {"Range": f"bytes={offset}-{end}"})
    expected = f"bytes {offset}-{end}/{size}"
    if response.status != 206 or response.headers.get("Content-Range") != expected or len(data) != end-offset+1:
        raise IOError(f"invalid HTTP range response for bytes {offset}-{end}")
    return data


def render_fields(context, source: SourceBundle, fields: dict, render_tiles) -> tuple[list, dict, int, int]:
    params, tiles, count, size = [], {}, 0, 0
    root = context.output / context.model.id / context.cycle.strftime("%Y%m%dT%H00Z")
    processed = datetime.now(UTC)
    for field_id, descriptors in fields.items():
        item = descriptors[0]
        spec = FIELDS[field_id]
        field_dir = root / field_id
        from .render import TileRenderRequest
        tile_count, tile_size = render_tiles(TileRenderRequest(item["values"], item["lats"], item["lons"], field_dir, spec[4]))
        params.append(parameter_metadata(ParameterBuild(context, source, processed, field_id, item, spec, descriptors)))
        tiles.update(tile_objects(context, field_id, field_dir))
        count += tile_count
        size += tile_size
    return params, tiles, count, size


def parameter_metadata(request: ParameterBuild) -> dict:
    context, source, processed = request.context, request.source, request.processed
    field_id, item, spec, descriptors = request.field_id, request.item, request.spec, request.descriptors
    cycle_id = context.cycle.strftime("%Y%m%dT%H00Z")
    cycle_text = context.cycle.strftime("%Y-%m-%dT%H:%M:%SZ")
    level = next((entry["record"].get("level") for entry in descriptors if entry["record"].get("level")), spec[3])
    return {"id": field_id, "displayName": field_id.replace("-", " ").title(), "units": spec[1], "level": {"type": spec[2], "label": level}, "legend": [{"value": value, "label": str(value), "color": color} for value, color in spec[4]], "displayType": "raster", "data": {"type": "xyz-raster", "urlTemplate": f"https://gfc.weatherboysuper.com/api/mesoscale/tiles/{context.model.id}/{cycle_id}/f00/{field_id}/{{z}}/{{x}}/{{y}}.png", "format": "image/png", "projection": "EPSG:3857", "minZoom": ZOOM_MIN, "maxZoom": ZOOM_MAX, "bounds": [-130, 20, -60, 55]}, "source": source_metadata(context.model), "receivedAt": source.received.strftime("%Y-%m-%dT%H:%M:%SZ"), "processedAt": processed.strftime("%Y-%m-%dT%H:%M:%SZ"), "ageMinutes": max(0, int((processed-context.cycle).total_seconds() // 60)), "processingVersion": VERSION, "status": "complete", "sourceSha256": item["sourceHash"], "sourceBytes": item["sourceBytes"], **({"sourceInputs": item["sourceInputs"]} if field_id == "wind-speed-10m" else {})}


def tile_objects(context, field_id: str, field_dir: Path) -> dict:
    cycle_id = context.cycle.strftime("%Y%m%dT%H00Z")
    return {f"mesoscale/v1/tiles/{context.model.id}/{cycle_id}/f00/{field_id}/{path.relative_to(field_dir).as_posix()}": path for path in field_dir.rglob("*.png")}


def build_catalog(request: CatalogBuild) -> dict:
    context, source, params = request.context, request.source, request.parameters
    downloaded, tile_count, tile_bytes = request.downloaded, request.tile_count, request.tile_bytes
    expected = set(FIELDS) - ({"surface-lcl"} if context.model.id == "rap" else set())
    available = {item["id"] for item in params}
    missing = [{"id": field_id, "reason": "No exact parameter and level match in the model .idx for this cycle"} for field_id in sorted(expected - available)]
    status = "complete" if not missing else "partial"
    processed = datetime.now(UTC)
    cycle_text = context.cycle.strftime("%Y-%m-%dT%H:%M:%SZ")
    age = max(0, int((processed-context.cycle).total_seconds() // 60))
    return {"schemaVersion": 1, "model": {"id": context.model.id, "name": context.model.name}, "cycleTime": cycle_text, "status": status, "receivedAt": source.received.strftime("%Y-%m-%dT%H:%M:%SZ"), "processedAt": processed.strftime("%Y-%m-%dT%H:%M:%SZ"), "ageMinutes": age, "processingVersion": VERSION, "domain": {"id": "conus", "name": "CONUS", "projection": "EPSG:3857", "bounds": [-130, 20, -60, 55], "minZoom": ZOOM_MIN, "maxZoom": ZOOM_MAX}, "source": source_metadata(context.model), "requestedParameterIds": sorted(expected), "unavailableParameters": missing, "frames": [{"forecastHour": 0, "validTime": cycle_text, "frameType": "analysis", "status": status, "parameters": params, "unavailableParameters": missing}], "metrics": {"bytesDownloaded": downloaded, "tiles": tile_count, "bytesPublished": tile_bytes}}
