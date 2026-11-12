"""Small orchestration steps for model cycle rendering."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from inventory import parse_idx, resolve_ranges

from .archives import ArchiveRequest, create_archive
from .discovery import FrameSource, request
from .fields import DERIVED_INPUT_IDENTITIES, FIELDS, OPTIONAL_FIELDS, VERSION, Model, display_name, identities_for_field, source_metadata, zoom_range

BOUNDS = [-130, 20, -60, 55]


@dataclass(frozen=True)
class SourceBundle:
    object_size: int
    ranged: list
    by_offset: dict
    received: datetime


@dataclass(frozen=True)
class RenderResult:
    catalog: dict
    archives: dict[str, Path]
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
class FrameResult:
    source: FrameSource
    parameters: list[dict]
    archives: dict[str, Path]
    tiles: int
    tile_bytes: int
    archive_bytes: int
    downloaded: int
    received: datetime


@dataclass(frozen=True)
class CycleBuild:
    context: object
    frames: list[dict]
    results: list[FrameResult]


@dataclass(frozen=True)
class FrameProcessRequest:
    context: object
    frame: FrameSource
    decode_range: object
    render_tiles: object
    combine_wind: object
    numpy: object


def process(context, decode_range, render_tiles, combine_wind) -> RenderResult:
    import numpy as np
    results = [process_frame(FrameProcessRequest(context, frame, decode_range, render_tiles, combine_wind, np)) for frame in context.frames]
    frames = [frame_record(context, result) for result in results]
    catalog = build_catalog(CycleBuild(context, frames, results))
    archives = {key: path for result in results for key, path in result.archives.items()}
    metrics = cycle_metrics(frames, results)
    catalog["metrics"] = metrics
    report_result(catalog, metrics)
    return RenderResult(catalog, archives, metrics)


def process_frame(request: FrameProcessRequest) -> FrameResult:
    context, frame, np = request.context, request.frame, request.numpy
    frame_context = frame_context_for(context, frame)
    source = load_source(frame_context)
    fields, downloaded = decode_source(frame_context, source, request.decode_range, np)
    combined = request.combine_wind(fields, np)
    from .render import derive_fixed_stp
    derive_fixed_stp(combined, np, context.model.id)
    for input_id in ("stp-input-vucsh", "stp-input-vvcsh"):
        combined.pop(input_id, None)
    params, archives, tiles, tile_bytes, archive_bytes = render_fields(frame_context, source, combined, request.render_tiles)
    return FrameResult(frame, params, archives, tiles, tile_bytes, archive_bytes, downloaded, source.received)


def frame_context_for(context, frame):
    from dataclasses import replace
    return replace(context, source_url=frame.url, modified=frame.modified, forecast_hour=frame.forecast_hour)


def load_source(context) -> SourceBundle:
    idx, _ = request(f"{context.source_url}.idx")
    _, head = request(context.source_url, method="HEAD")
    size = int(head.headers["Content-Length"])
    records = parse_idx(idx.decode("ascii"))
    selected = select_fields(context.model, records, size)
    ranged = resolve_ranges(records, size)
    return SourceBundle(size, ranged, group_ranges(selected), received_time(context.modified))


def select_fields(model: Model, records: list, size: int) -> dict:
    from inventory import resolve_allowlist
    identities = {
        f"{field_id}:{identity['parameter']}": identity
        for field_id, spec in FIELDS.items()
        for group in identities_for_field(model.id, field_id, spec[0])
        for identity in group
    }
    if model.id in {"hrrr", "rrfs"}:
        identities.update({
            f"{field_id}:{identity['parameter']}": identity
            for field_id, identity in DERIVED_INPUT_IDENTITIES.items()
        })
    return resolve_allowlist(records, size, identities)


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
    if not valid_range_response(response, data, expected, end - offset + 1):
        raise IOError(f"invalid HTTP range response for bytes {offset}-{end}")
    return data


def valid_range_response(response, data: bytes, expected_range: str, expected_bytes: int) -> bool:
    return response.status == 206 and response.headers.get("Content-Range") == expected_range and len(data) == expected_bytes


def render_fields(context, source: SourceBundle, fields: dict, render_tiles) -> tuple[list, dict, int, int, int]:
    params, archives, count, tile_size, archive_size = [], {}, 0, 0, 0
    min_zoom, max_zoom = zoom_range(context.model.id)
    root = context.output / context.model.id / context.cycle.strftime("%Y%m%dT%H00Z") / f"f{context.forecast_hour:02d}"
    processed = datetime.now(UTC)
    for field_id, descriptors in fields.items():
        item, spec = descriptors[0], FIELDS[field_id]
        field_dir = root / field_id
        from .render import TileRenderRequest
        tile_count, bytes_written = render_tiles(TileRenderRequest(item["values"], item["lats"], item["lons"], field_dir, spec[4], max_zoom))
        key = archive_key(context, field_id)
        archive = create_archive(ArchiveRequest(field_dir, root / f"{field_id}.pmtiles", min_zoom, max_zoom))
        parameter = parameter_metadata(ParameterBuild(context, source, processed, field_id, item, spec, descriptors))
        parameter["data"].update({"archiveKey": key, "archiveSha256": archive.sha256, "archiveBytes": archive.size, "tileCompression": "none"})
        params.append(parameter)
        archives[key] = archive.path
        count += tile_count
        tile_size += bytes_written
        archive_size += archive.size
    return params, archives, count, tile_size, archive_size


def archive_key(context, field_id: str) -> str:
    cycle_id = context.cycle.strftime("%Y%m%dT%H00Z")
    return f"mesoscale/v1/archives/{context.model.id}/{cycle_id}/f{context.forecast_hour:02d}/{field_id}.pmtiles"


def parameter_metadata(request: ParameterBuild) -> dict:
    context, source, processed = request.context, request.source, request.processed
    field_id, item, spec, descriptors = request.field_id, request.item, request.spec, request.descriptors
    cycle_id = context.cycle.strftime("%Y%m%dT%H00Z")
    hour = context.forecast_hour
    level = next((entry["record"].get("level") for entry in descriptors if entry["record"].get("level")), spec[3])
    min_zoom, max_zoom = zoom_range(context.model.id)
    legend = [{"value": value, "label": "1 (conventional reference, not a probability)" if field_id == "stp-fixed-surface" and value == 1 else str(value), "color": color} for value, color in spec[4]]
    metadata = {"calculation": "derived index, calculated by GFC from NOAA model fields", "formula": "STP = (SBCAPE / 1500) * clamp((2000 - SBLCL) / 1000, 0, 1) * (SRH01 / 150) * fBWD6 * fCIN; fBWD6 = 0 when BWD6 < 12.5 m/s, otherwise clamp(BWD6, 0, 30) / 20; fCIN = clamp((200 + SBCIN) / 150, 0, 1) when surface CIN is available, otherwise 1", "inputs": ["CAPE:surface (SBCAPE, J/kg)", "HGT:level of adiabatic condensation from sfc (surface LCL, m AGL)", "HLCY:1000-0 m above ground (0-1 km SRH, m2/s2)", "VUCSH:0-6000 m above ground and VVCSH:0-6000 m above ground (BWD6 components, m/s; NOAA metadata labels units s**-1)", "CIN:surface (SBCIN, J/kg; optional CIN factor)"]} if field_id == "stp-fixed-surface" else None
    return {"id": field_id, "displayName": display_name(field_id), "units": spec[1], "level": {"type": spec[2], "label": level}, "legend": legend, "displayType": "raster", "data": {"type": "xyz-raster", "urlTemplate": f"https://app.gfcweather.com/api/mesoscale/tiles/{context.model.id}/{cycle_id}/f{hour:02d}/{field_id}/{{z}}/{{x}}/{{y}}.png", "format": "image/png", "projection": "EPSG:3857", "minZoom": min_zoom, "maxZoom": max_zoom, "bounds": BOUNDS}, "source": source_metadata(context.model), "receivedAt": source.received.strftime("%Y-%m-%dT%H:%M:%SZ"), "processedAt": processed.strftime("%Y-%m-%dT%H:%M:%SZ"), "ageMinutes": max(0, int((processed-context.cycle).total_seconds() // 60)), "processingVersion": VERSION, "status": "complete", "sourceSha256": item["sourceHash"], "sourceBytes": item["sourceBytes"], **({"metadata": metadata} if metadata else {}), **({"sourceInputs": item["sourceInputs"]} if field_id in {"wind-speed-10m", "stp-fixed-surface"} else {})}


def frame_record(context, result: FrameResult) -> dict:
    hour = result.source.forecast_hour
    cycle_text = (context.cycle + timedelta(hours=hour)).strftime("%Y-%m-%dT%H:%M:%SZ")
    expected = set(FIELDS) - ({"surface-lcl"} if context.model.id == "rap" else set())
    if context.model.id == "rap":
        expected.discard("stp-fixed-surface")
    available = {parameter["id"] for parameter in result.parameters}
    missing = [
        {
            "id": field_id,
            "reason": (
                "Required input is missing or its grid does not align"
                if field_id == "stp-fixed-surface"
                else "No exact parameter and level match in the frame .idx"
            ),
        }
        for field_id in sorted(expected - available)
    ]
    required_missing = {item["id"] for item in missing} - OPTIONAL_FIELDS
    status = "partial" if required_missing else "complete"
    return {"forecastHour": hour, "validTime": cycle_text, "frameType": "analysis" if hour == 0 else "forecast", "status": status, "parameters": result.parameters, "unavailableParameters": missing}


def build_catalog(request: CycleBuild) -> dict:
    context, frames = request.context, request.frames
    complete = all(frame["status"] == "complete" for frame in frames)
    processed = datetime.now(UTC)
    cycle_text = context.cycle.strftime("%Y-%m-%dT%H:%M:%SZ")
    received = min((result.received for result in request.results), default=processed)
    age = max(0, int((processed-context.cycle).total_seconds() // 60))
    min_zoom, max_zoom = zoom_range(context.model.id)
    requested = set(FIELDS) - ({"surface-lcl", "stp-fixed-surface"} if context.model.id == "rap" else set())
    return {"schemaVersion": 1, "model": {"id": context.model.id, "name": context.model.name}, "cycleTime": cycle_text, "status": "complete" if complete else "partial", "receivedAt": received.strftime("%Y-%m-%dT%H:%M:%SZ"), "processedAt": processed.strftime("%Y-%m-%dT%H:%M:%SZ"), "ageMinutes": age, "processingVersion": VERSION, "domain": {"id": "conus", "name": "CONUS", "projection": "EPSG:3857", "bounds": BOUNDS, "minZoom": min_zoom, "maxZoom": max_zoom}, "source": source_metadata(context.model), "requestedParameterIds": sorted(requested), "frames": frames}


def cycle_metrics(frames: list[dict], results: list[FrameResult]) -> dict:
    return {"framesComplete": sum(frame["status"] == "complete" for frame in frames), "framesFailed": sum(frame["status"] == "failed" for frame in frames), "tiles": sum(result.tiles for result in results), "bytesDownloaded": sum(result.downloaded for result in results), "bytesPublished": sum(result.archive_bytes for result in results), "archives": sum(len(result.archives) for result in results)}


def report_result(catalog: dict, metrics: dict) -> None:
    print(json.dumps({"model": catalog["model"]["id"], "cycle": catalog["cycleTime"], "status": catalog["status"], **metrics, "fieldsPerFrame": {f"f{frame['forecastHour']:02d}": len(frame["parameters"]) for frame in catalog["frames"]}}, indent=2))
