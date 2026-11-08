"""Download, decode and publish native NOAA mesoscale fields as XYZ PNG tiles."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

from inventory import IndexRecord, parse_idx, resolve_ranges

VERSION = "gfc-mesoscale-ingest/1.0.0"
ZOOM_MIN, ZOOM_MAX = 3, 4
RETRIES = 4
RETRY_BASE_SECONDS = 1
TILE_SIZE = 256
WEB_MERCATOR_LIMIT = 85.05112878


@dataclass(frozen=True)
class Model:
    id: str
    name: str
    bucket: str
    dataset_id: str
    cadence: int
    product: str
    path: str


MODELS = {
    "hrrr": Model("hrrr", "High-Resolution Rapid Refresh", "noaa-hrrr-bdp-pds", "noaa-hrrr-bdp-pds", 1, "wrfsfc", "hrrr.{date}/conus/hrrr.t{hour}z.wrfsfcf{fh:02d}.grib2"),
    "rap": Model("rap", "Rapid Refresh", "noaa-rap-pds", "noaa-rap-pds", 1, "awip32", "rap.{date}/rap.t{hour}z.awip32f{fh:02d}.grib2"),
    "rrfs": Model("rrfs", "Rapid Refresh Forecast System", "noaa-rrfs-ops-pds", "noaa-rrfs-ops-pds", 1, "2dfld", "rrfs.{date}/{hour}/rrfs.t{hour}z.2dfld.3km.f{fh:03d}.conus.grib2"),
}

# Exact index identities. CAPE/CIN layer labels are intentionally native.
FIELDS = {
    "temperature-2m": ({"TMP": "2 m above ground"}, "°C", "height", "2 m above ground", [( -40, "#313695"), (-20, "#4575b4"), (0, "#abd9e9"), (15, "#ffffbf"), (30, "#fdae61"), (45, "#a50026")], "temperature"),
    "dewpoint-2m": ({"DPT": "2 m above ground"}, "°C", "height", "2 m above ground", [(-40, "#542788"), (-20, "#998ec3"), (0, "#f7f7f7"), (15, "#7fbf7b"), (25, "#1b7837")], "temperature"),
    "wind-speed-10m": ({"UGRD": "10 m above ground", "VGRD": "10 m above ground"}, "m s⁻¹", "height", "10 m above ground", [(0, "#f7fbff"), (5, "#c6dbef"), (10, "#6baed6"), (20, "#2171b5"), (35, "#08306b")], "wind"),
    "cape-surface": ({"CAPE": "surface"}, "J kg⁻¹", "surface", "surface", [(0, "#fff7bc"), (500, "#fec44f"), (1500, "#fe9929"), (3000, "#cc4c02"), (5000, "#7f0000")], "native"),
    "cin-surface": ({"CIN": "surface"}, "J kg⁻¹", "surface", "surface", [(-300, "#542788"), (-150, "#998ec3"), (-50, "#d8daeb"), (0, "#f7f7f7")], "native"),
    "cape-180-0mb-agl": ({"CAPE": "180-0 mb above ground"}, "J kg⁻¹", "layer", "180-0 mb above ground", [(0, "#fff7bc"), (500, "#fec44f"), (1500, "#fe9929"), (3000, "#cc4c02"), (5000, "#7f0000")], "native"),
    "cape-90-0mb-agl": ({"CAPE": "90-0 mb above ground"}, "J kg⁻¹", "layer", "90-0 mb above ground", [(0, "#fff7bc"), (500, "#fec44f"), (1500, "#fe9929"), (3000, "#cc4c02"), (5000, "#7f0000")], "native"),
    "cape-255-0mb-agl": ({"CAPE": "255-0 mb above ground"}, "J kg⁻¹", "layer", "255-0 mb above ground", [(0, "#fff7bc"), (500, "#fec44f"), (1500, "#fe9929"), (3000, "#cc4c02"), (5000, "#7f0000")], "native"),
    "cape-0-3000m-agl": ({"CAPE": "0-3000 m above ground"}, "J kg⁻¹", "layer", "0-3000 m above ground", [(0, "#fff7bc"), (500, "#fec44f"), (1500, "#fe9929"), (3000, "#cc4c02"), (5000, "#7f0000")], "native"),
    "cin-180-0mb-agl": ({"CIN": "180-0 mb above ground"}, "J kg⁻¹", "layer", "180-0 mb above ground", [(-300, "#542788"), (-150, "#998ec3"), (-50, "#d8daeb"), (0, "#f7f7f7")], "native"),
    "cin-90-0mb-agl": ({"CIN": "90-0 mb above ground"}, "J kg⁻¹", "layer", "90-0 mb above ground", [(-300, "#542788"), (-150, "#998ec3"), (-50, "#d8daeb"), (0, "#f7f7f7")], "native"),
    "cin-255-0mb-agl": ({"CIN": "255-0 mb above ground"}, "J kg⁻¹", "layer", "255-0 mb above ground", [(-300, "#542788"), (-150, "#998ec3"), (-50, "#d8daeb"), (0, "#f7f7f7")], "native"),
    "srh-0-1km": ({"HLCY": "1000-0 m above ground"}, "m² s⁻²", "layer", "0-1 km above ground", [(0, "#ffffcc"), (100, "#a1dab4"), (200, "#41b6c4"), (300, "#2c7fb8"), (500, "#253494")], "native"),
    "srh-0-3km": ({"HLCY": "3000-0 m above ground"}, "m² s⁻²", "layer", "0-3 km above ground", [(0, "#ffffcc"), (100, "#a1dab4"), (200, "#41b6c4"), (300, "#2c7fb8"), (500, "#253494")], "native"),
    "surface-lcl": ({"HGT": "level of adiabatic condensation from sfc"}, "m", "surface", "surface-based parcel LCL", [(0, "#edf8fb"), (500, "#b2e2e2"), (1000, "#66c2a4"), (2000, "#2ca25f"), (3000, "#006d2c")], "native"),
    "pwat": ({"PWAT": "entire atmosphere (considered as a single layer)"}, "kg m⁻²", "layer", "entire atmosphere", [(0, "#fff7fb"), (10, "#ece7f2"), (25, "#a6bddb"), (40, "#2b8cbe"), (60, "#045a8d")], "native"),
    "mslp": ({"MSLMA": "mean sea level", "MSLET": "mean sea level"}, "hPa", "surface", "mean sea level", [(960, "#313695"), (980, "#74add1"), (1000, "#ffffbf"), (1020, "#fdae61"), (1040, "#a50026")], "pressure"),
    "reflectivity": ({"REFC": "entire atmosphere"}, "dBZ", "model", "entire atmosphere", [(5, "#04e9e7"), (20, "#019ff4"), (35, "#0300f4"), (45, "#02fd02"), (55, "#fdf802"), (65, "#fd0100"), (75, "#a80000")], "native"),
}


class Store(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...
    def get(self, key: str) -> bytes | None: ...
    def list(self, prefix: str) -> list[str]: ...
    def delete(self, key: str) -> None: ...


class LocalStore:
    def __init__(self, root: Path):
        self.root = root

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError("storage key escapes root")
        return path

    def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
        try:
            with os.fdopen(fd, "wb") as out:
                out.write(data)
                out.flush()
                os.fsync(out.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def get(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def list(self, prefix: str) -> list[str]:
        base = self._path(prefix)
        if base.is_file():
            return [prefix]
        if not base.exists():
            return []
        return [p.relative_to(self.root).as_posix() for p in base.rglob("*") if p.is_file()]

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class R2Store:
    """Cloudflare R2 adapter using boto3's S3-compatible API."""
    def __init__(self, account_id: str, bucket: str, access_key: str, secret_key: str):
        import boto3
        self.bucket = bucket
        self.client = boto3.client("s3", endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com", aws_access_key_id=access_key, aws_secret_access_key=secret_key, region_name="auto")

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def get(self, key: str) -> bytes | None:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            return None

    def list(self, prefix: str) -> list[str]:
        paginator = self.client.get_paginator("list_objects_v2")
        return [obj["Key"] for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix) for obj in page.get("Contents", [])]

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


def request(url: str, headers: dict[str, str] | None = None, attempts: int = RETRIES) -> tuple[bytes, object]:
    error = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "GFC-mesoscale-ingest/1.0", **(headers or {})})
            response = urllib.request.urlopen(req, timeout=30)
            return response.read(), response
        except urllib.error.HTTPError as exc:
            if 400 <= exc.code < 500 and exc.code != 429:
                raise RuntimeError(f"NOAA object unavailable ({exc.code}): {url}") from exc
            error = exc
            if attempt + 1 < attempts:
                time.sleep(RETRY_BASE_SECONDS * 2**attempt)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            error = exc
            if attempt + 1 < attempts:
                time.sleep(RETRY_BASE_SECONDS * 2**attempt)
    raise RuntimeError(f"request failed after {attempts} attempts: {url}: {error}")


def discover_cycle(model: Model, now: datetime | None = None, lookback_hours: int = 30) -> tuple[datetime, str, str]:
    """Return newest f00 whose GRIB and index exist and whose index resolves all required fields."""
    now = now or datetime.now(UTC)
    base = now.replace(minute=0, second=0, microsecond=0)
    for age in range(lookback_hours):
        cycle = base - timedelta(hours=age)
        if cycle.hour % model.cadence:
            continue
        date, hour = cycle.strftime("%Y%m%d"), cycle.strftime("%H")
        object_key = model.path.format(date=date, hour=hour, fh=0)
        root = f"https://{model.bucket}.s3.amazonaws.com/{object_key}"
        try:
            idx, _ = request(f"{root}.idx")
            head = urllib.request.urlopen(urllib.request.Request(root, method="HEAD", headers={"User-Agent": "GFC-mesoscale-ingest/1.0"}), timeout=15)
            size = int(head.headers["Content-Length"])
            rows = parse_idx(idx.decode("ascii"))
            required = required_identities(model.id)
            matches = resolve_ranges(rows, size)
            if all(any(any(rec.parameter == candidate["parameter"] and rec.level == candidate["level"] for rec, _ in matches) for candidate in group) for group in required):
                modified = head.headers.get("Last-Modified") or ""
                return cycle, root, modified
        except (RuntimeError, urllib.error.HTTPError, urllib.error.URLError, KeyError, ValueError):
            continue
    raise RuntimeError(f"No complete {model.id} f00 cycle found in the last {lookback_hours} hours")


def required_identities(model_id: str) -> list[list[dict[str, str]]]:
    # Every advertised native field must be present before a cycle is complete.
    identities: list[list[dict[str, str]]] = []
    for fid, (records, *_rest) in FIELDS.items():
        # The verified RAP AWIP32 f00 product lacks surface-based LCL; it is an optional field.
        if model_id == "rap" and fid == "surface-lcl":
            continue
        group = [{"parameter": parameter, "level": ("entire atmosphere (considered as a single layer)" if model_id == "rrfs" and fid == "reflectivity" else level)} for parameter, level in records.items()]
        # MSLMA and MSLET are model-specific equivalents for mean sea-level pressure.
        if fid == "mslp":
            identities.append(group)
        else:
            identities.extend([[identity] for identity in group])
    return identities


def hex_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i:i+2], 16) for i in (1, 3, 5))


def colorize(value: float, stops: list[tuple[float, str]]) -> tuple[int, int, int, int]:
    if not math.isfinite(value):
        return (0, 0, 0, 0)
    if value <= stops[0][0]:
        return (*hex_rgb(stops[0][1]), 190)
    for (lo, c0), (hi, c1) in zip(stops, stops[1:]):
        if value <= hi:
            ratio = (value - lo) / (hi - lo)
            a, b = hex_rgb(c0), hex_rgb(c1)
            return (*(round(a[i] + (b[i] - a[i]) * ratio) for i in range(3)), 190)
    return (*hex_rgb(stops[-1][1]), 190)


def render_tiles(values, latitudes, longitudes, root: Path, stops: list[tuple[float, str]]) -> tuple[int, int]:
    """Reproject values to Web Mercator and render a bounded zoom 3-5 XYZ pyramid."""
    import numpy as np
    from PIL import Image
    from pyproj import Transformer
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    x, y = transformer.transform(longitudes, latitudes)
    x, y = np.asarray(x), np.asarray(y)
    valid = np.isfinite(values) & np.isfinite(x) & np.isfinite(y) & (np.abs(latitudes) <= WEB_MERCATOR_LIMIT)
    if not valid.any():
        raise ValueError("decoded field has no projectable values")
    extent = (-20037508.342789244, -20037508.342789244, 20037508.342789244, 20037508.342789244)
    span = extent[2] - extent[0]
    px = ((x - extent[0]) / span * (TILE_SIZE * 2**ZOOM_MAX)).astype(np.int64)
    py = ((extent[3] - y) / span * (TILE_SIZE * 2**ZOOM_MAX)).astype(np.int64)
    rgba = np.zeros((TILE_SIZE * 2**ZOOM_MAX, TILE_SIZE * 2**ZOOM_MAX, 4), dtype=np.uint8)
    inside = valid & (px >= 0) & (px < rgba.shape[1]) & (py >= 0) & (py < rgba.shape[0])
    sample = values[inside]
    stop_values = np.asarray([stop[0] for stop in stops], dtype=float)
    stop_colors = np.asarray([hex_rgb(stop[1]) for stop in stops], dtype=float)
    index = np.clip(np.searchsorted(stop_values, sample, side="right") - 1, 0, len(stops) - 2)
    fraction = np.clip((sample - stop_values[index]) / (stop_values[index + 1] - stop_values[index]), 0, 1)
    colors = np.rint(stop_colors[index] + (stop_colors[index + 1] - stop_colors[index]) * fraction[:, None]).astype(np.uint8)
    pixels = rgba[py[inside], px[inside]]
    pixels[:, :3] = colors
    pixels[:, 3] = 190
    rgba[py[inside], px[inside]] = pixels
    image = Image.fromarray(rgba, "RGBA")
    root.mkdir(parents=True, exist_ok=True)
    count, total = 0, 0
    for zoom in range(ZOOM_MIN, ZOOM_MAX + 1):
        scale = 2 ** (ZOOM_MAX - zoom)
        level = image.resize((TILE_SIZE * 2**zoom, TILE_SIZE * 2**zoom), Image.Resampling.BOX) if scale > 1 else image
        for tx in range(2**zoom):
            for ty in range(2**zoom):
                tile = level.crop((tx*TILE_SIZE, ty*TILE_SIZE, (tx+1)*TILE_SIZE, (ty+1)*TILE_SIZE))
                if tile.getbbox() is None:
                    continue
                path = root / str(zoom) / str(tx) / f"{ty}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                tile.save(path, format="PNG", optimize=True)
                count += 1
                total += path.stat().st_size
    return count, total


def validate_catalog(catalog: dict) -> None:
    required = {"schemaVersion", "model", "cycleTime", "status", "receivedAt", "processedAt", "ageMinutes", "processingVersion", "domain", "frames"}
    if not required <= set(catalog) or catalog["schemaVersion"] != 1:
        raise ValueError("catalog missing required v1 fields")
    if catalog["status"] not in {"complete", "partial", "failed"}:
        raise ValueError("invalid catalog status")
    if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", catalog["cycleTime"]):
        raise ValueError("cycleTime must be RFC3339 UTC")
    for frame in catalog["frames"]:
        if frame["frameType"] != ("analysis" if frame["forecastHour"] == 0 else "forecast"):
            raise ValueError("frame type must agree with forecast hour")
        for field in frame["parameters"]:
            if not {"id", "displayName", "units", "level", "legend", "displayType", "data", "source", "receivedAt", "processedAt", "ageMinutes", "processingVersion", "status"} <= field.keys():
                raise ValueError("parameter does not satisfy provider catalog contract")
            if field["displayType"] != "raster" or field["data"].get("type") != "xyz-raster":
                raise ValueError("v1 parameters must be XYZ raster descriptors")
            if not all(token in field["data"]["urlTemplate"] for token in ("{z}", "{x}", "{y}")):
                raise ValueError("tile URL template must contain {z}/{x}/{y}")


def process_f00(model: Model, cycle: datetime, source_url: str, modified: str, output: Path) -> dict:
    """Fetch exact .idx messages, decode, reproject and render all available allowlisted fields."""
    import numpy as np
    from eccodes import codes_get, codes_get_values, codes_new_from_message, codes_release
    from inventory import resolve_allowlist

    idx_bytes, _ = request(f"{source_url}.idx")
    head = urllib.request.urlopen(urllib.request.Request(source_url, method="HEAD", headers={"User-Agent": "GFC-mesoscale-ingest/1.0"}), timeout=30)
    object_size = int(head.headers["Content-Length"])
    records = parse_idx(idx_bytes.decode("ascii"))
    allowlist: dict[str, dict[str, str]] = {}
    for fid, (idents, *_rest) in FIELDS.items():
        for parameter, level in idents.items():
            if model.id == "rrfs" and fid == "reflectivity":
                level = "entire atmosphere (considered as a single layer)"
            allowlist[f"{fid}:{parameter}"] = {"parameter": parameter, "level": level}
    selected = resolve_allowlist(records, object_size, allowlist)
    by_offset: dict[int, tuple[int, list[str]]] = {}
    ranged = resolve_ranges(records, object_size)
    for fid, matches in selected.items():
        for match in matches:
            start, end = match["range"]["start"], match["range"]["end"]
            by_offset.setdefault(start, (end, []))[1].append(fid)
    received = datetime.now(UTC)
    try:
        received = datetime.strptime(modified, "%a, %d %b %Y %H:%M:%S %Z").replace(tzinfo=UTC)
    except ValueError:
        pass
    processed = datetime.now(UTC)
    field_outputs: dict[str, list[dict]] = {}
    tiles: dict[str, Path] = {}
    downloaded = 0
    tile_count = 0
    tile_bytes = 0
    temp_root = output / model.id / cycle.strftime("%Y%m%dT%H00Z")
    for offset, (end, field_ids) in by_offset.items():
        content, response = request(source_url, {"Range": f"bytes={offset}-{end}"})
        if response.status != 206 or response.headers.get("Content-Range") != f"bytes {offset}-{end}/{object_size}" or len(content) != end - offset + 1:
            raise IOError(f"invalid HTTP range response for bytes {offset}-{end}")
        downloaded += len(content)
        digest = hashlib.sha256(content).hexdigest()
        handle = codes_new_from_message(content)
        try:
            values = np.asarray(codes_get_values(handle), dtype=float)
            ni, nj = int(codes_get(handle, "Ni")), int(codes_get(handle, "Nj"))
            if values.size != ni * nj:
                raise ValueError(f"decoded grid shape mismatch: {values.size} values, {ni}x{nj}")
            lats, lons = handle_latlon(handle)
            values = values.reshape((nj, ni))
            lats, lons = lats.reshape((nj, ni)), lons.reshape((nj, ni))
            for fid in field_ids:
                base_id = fid.split(":")[0]
                values_for_field = values
                # Convert native temperatures and pressure to documented display units.
                operation = FIELDS[base_id][5]
                if operation == "temperature":
                    values_for_field = values - 273.15
                elif operation == "pressure":
                    values_for_field = values / 100
                elif operation == "wind":
                    pass  # Keep each native component until the transparent vector magnitude is formed.
                field_outputs.setdefault(base_id, []).append({"values": values_for_field, "lats": lats, "lons": lons, "sourceHash": digest, "sourceBytes": len(content), "record": next((asdict(r) for r, _ in ranged if r.offset == offset), {})})
        finally:
            codes_release(handle)
    # True vector magnitude is a transparent display arithmetic conversion of native U/V.
    for fid in ("wind-speed-10m",):
        components = field_outputs.pop(fid, [])
        u = next((x for x in components if x["record"].get("parameter") == "UGRD"), None)
        v = next((x for x in components if x["record"].get("parameter") == "VGRD"), None)
        if u and v:
            u["values"] = np.hypot(u["values"], v["values"])
            field_outputs[fid] = [u]
    param_json = []
    for fid, descriptors in field_outputs.items():
        # The manifest may have model-specific alternate MSLP short names. Keep the first exact match.
        item = descriptors[0]
        spec = FIELDS[fid]
        field_dir = temp_root / fid
        count, size = render_tiles(item["values"], item["lats"], item["lons"], field_dir, spec[4])
        tile_count += count
        tile_bytes += size
        for file in field_dir.rglob("*.png"):
            key = f"mesoscale/v1/tiles/{model.id}/{cycle.strftime('%Y%m%dT%H00Z')}/f00/{fid}/{file.relative_to(field_dir).as_posix()}"
            tiles[key] = file
        legend = [{"value": value, "label": str(value), "color": color} for value, color in spec[4]]
        idents = spec[0]
        level_label = next((r["record"].get("level") for r in descriptors if r["record"].get("level")), spec[3])
        param_json.append({
            "id": fid, "displayName": fid.replace("-", " ").title(), "units": spec[1],
            "level": {"type": spec[2], "label": level_label}, "legend": legend, "displayType": "raster",
            "data": {"type": "xyz-raster", "urlTemplate": f"https://gfc.weatherboysuper.com/api/mesoscale/tiles/{model.id}/{cycle.strftime('%Y%m%dT%H00Z')}/f00/{fid}/{{z}}/{{x}}/{{y}}.png", "format": "image/png", "projection": "EPSG:3857", "minZoom": ZOOM_MIN, "maxZoom": ZOOM_MAX, "bounds": [-130, 20, -60, 55]},
            "source": source_metadata(model), "receivedAt": received.isoformat().replace("+00:00", "Z"), "processedAt": processed.isoformat().replace("+00:00", "Z"),
            "ageMinutes": max(0, int((processed-cycle).total_seconds() // 60)), "processingVersion": VERSION, "status": "complete",
            "sourceSha256": item["sourceHash"], "sourceBytes": item["sourceBytes"],
        })
    expected = set(FIELDS)
    if model.id == "rap":
        expected.remove("surface-lcl")
    available = {entry["id"] for entry in param_json}
    missing = [{"id": fid, "reason": "No exact parameter and level match in the model .idx for this cycle"} for fid in sorted(expected - available)]
    # Wind vectors share index offsets for some products and must be combined by raw parameter label.
    status = "complete" if not missing else "partial"
    processed = datetime.now(UTC)
    processed_text = processed.strftime("%Y-%m-%dT%H:%M:%SZ")
    for parameter in param_json:
        parameter["processedAt"] = processed_text
        parameter["ageMinutes"] = max(0, int((processed-cycle).total_seconds() // 60))
    timestamp = cycle.strftime("%Y-%m-%dT%H:%M:%SZ")
    received_text = received.strftime("%Y-%m-%dT%H:%M:%SZ")
    catalog = {"schemaVersion": 1, "model": {"id": model.id, "name": model.name}, "cycleTime": timestamp, "status": status, "receivedAt": received_text, "processedAt": processed_text, "ageMinutes": max(0, int((processed-cycle).total_seconds() // 60)), "processingVersion": VERSION, "domain": {"id": "conus", "name": "CONUS", "projection": "EPSG:3857", "bounds": [-130, 20, -60, 55], "minZoom": ZOOM_MIN, "maxZoom": ZOOM_MAX}, "source": source_metadata(model), "requestedParameterIds": sorted(expected), "unavailableParameters": missing, "frames": [{"forecastHour": 0, "validTime": timestamp, "frameType": "analysis", "status": status, "parameters": param_json, "unavailableParameters": missing}], "metrics": {"bytesDownloaded": downloaded, "tiles": tile_count, "bytesPublished": tile_bytes}}
    if status == "complete":
        for key, file in tiles.items():
            pass
    print(json.dumps({"model": model.id, "cycle": timestamp, "bytesDownloaded": downloaded, "tiles": tile_count, "tileBytes": tile_bytes, "fields": sorted(available), "missing": missing}, indent=2))
    return {"catalog": catalog, "tiles": tiles, "metrics": catalog["metrics"]}


def handle_latlon(handle):
    import numpy as np
    from eccodes import codes_get_array
    return np.asarray(codes_get_array(handle, "latitudes")), np.asarray(codes_get_array(handle, "longitudes"))


def source_metadata(model: Model) -> dict:
    link = "https://registry.opendata.aws/noaa-rrfs-ops/" if model.id == "rrfs" else f"https://registry.opendata.aws/{model.dataset_id}/"
    return {"providerId": "noaa-open-data", "providerName": "NOAA Open Data on AWS", "datasetId": model.dataset_id, "attribution": f"NOAA/NCEP {model.name} ({model.id.upper()})", "url": link}


def write_health(store: Store, model: Model, cycle: datetime, status: str, metrics: dict, received_at: str, processed_at: str, error: str | None = None) -> None:
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    health = {"schemaVersion": 1, "generatedAt": processed_at, "modelId": model.id, "expectedCycleTime": cycle.strftime("%Y-%m-%dT%H:%M:%SZ"), "latestAvailableCycleTime": cycle.strftime("%Y-%m-%dT%H:%M:%SZ") if status == "complete" else None, "status": status, "receivedAt": received_at, "processedAt": processed_at, "ageMinutes": max(0, int((datetime.now(UTC)-cycle).total_seconds() // 60)), "framesComplete": 1 if status == "complete" else 0, "framesFailed": 1 if status == "failed" else 0, "tilesWritten": metrics.get("tiles", 0), "bytesDownloaded": metrics.get("bytesDownloaded", 0), "bytesPublished": metrics.get("bytesPublished", 0), "error": error}
    key = f"mesoscale/v1/health/{today}/{model.id}.json"
    store.put(key, json.dumps(health, separators=(",", ":")).encode(), "application/json")


def publish_cycle(store: Store, model_id: str, cycle: datetime, catalog: dict, tile_files: dict[str, Path], keep: int = 6) -> None:
    """Publish tiles then immutable catalog, atomically move latest, then retain."""
    cycle_id = cycle.strftime("%Y%m%dT%H00Z")
    catalog_key = f"mesoscale/v1/catalog/{model_id}/{cycle_id}.json"
    prior = store.get(catalog_key)
    catalog_exists = False
    if prior:
        existing = json.loads(prior)
        if existing.get("status") == "complete":
            catalog_exists = True
    current_key = f"mesoscale/v1/latest/{model_id}.json"
    current = store.get(current_key)
    if current and datetime.fromisoformat(json.loads(current)["cycleTime"].replace("Z", "+00:00")) >= cycle:
        return
    if not catalog_exists:
        for key, path in tile_files.items():
            data = path.read_bytes()
            store.put(key, data, "image/png")
            if hashlib.sha256(store.get(key) or b"").digest() != hashlib.sha256(data).digest():
                raise IOError(f"published tile checksum mismatch: {key}")
    validate_catalog(catalog)
    if catalog["status"] != "complete":
        raise ValueError("partial or failed cycles cannot be published as latest")
    if not catalog_exists:
        store.put(catalog_key, json.dumps(catalog, separators=(",", ":")).encode(), "application/json")
    pointer = {"schemaVersion": 1, "modelId": model_id, "cycleTime": catalog["cycleTime"], "catalogUrl": f"/api/mesoscale/catalog/{model_id}/{cycle_id}.json", "publishedAt": catalog["processedAt"]}
    store.put(current_key, json.dumps(pointer, separators=(",", ":")).encode(), "application/json")
    catalogs = sorted((key for key in store.list(f"mesoscale/v1/catalog/{model_id}") if key.endswith(".json")), reverse=True)
    for old_catalog in catalogs[keep:]:
        old_id = Path(old_catalog).stem
        for key in store.list(f"mesoscale/v1/tiles/{model_id}/{old_id}"):
            store.delete(key)
        store.delete(old_catalog)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=MODELS, required=True)
    parser.add_argument("--output", type=Path, default=Path("build/mesoscale"))
    parser.add_argument("--dry-run", action="store_true", help="discover source and download/decode f00 without R2 credentials")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    model = MODELS[args.model]
    cycle, url, modified = discover_cycle(model)
    result = process_f00(model, cycle, url, modified, args.output)
    if not args.dry_run:
        account, bucket = os.getenv("R2_ACCOUNT_ID"), os.getenv("R2_BUCKET")
        access, secret = os.getenv("R2_ACCESS_KEY_ID"), os.getenv("R2_SECRET_ACCESS_KEY")
        if not all((account, bucket, access, secret)):
            raise SystemExit("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required")
        store = R2Store(account, bucket, access, secret)
        if result["catalog"]["status"] == "complete":
            publish_cycle(store, model.id, cycle, result["catalog"], result["tiles"])
        write_health(store, model, cycle, result["catalog"]["status"], result["metrics"], result["catalog"]["receivedAt"], result["catalog"]["processedAt"])


if __name__ == "__main__":
    main()
