"""Mesoscale ingest render responsibilities."""

from __future__ import annotations

import hashlib
import math
import os
import tempfile
import ctypes
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

from .fields import FIELDS, ZOOM_MIN, ZOOM_MAX, TILE_SIZE, WEB_MERCATOR_LIMIT, Model

VALUE_CONVERSIONS = {
    "temperature": lambda values: values - 273.15,
    "pressure": lambda values: values / 100,
}


@dataclass(frozen=True)
class TileRenderRequest:
    values: object
    latitudes: object
    longitudes: object
    root: Path
    stops: list[tuple[float, str]]


@dataclass(frozen=True)
class RasterRequest:
    x: object
    y: object
    values: object
    width: int
    height: int
    stops: list[tuple[float, str]]


@dataclass(frozen=True)
class DecodeRequest:
    content: bytes
    field_ids: list[str]
    offset: int
    ranged: list
    digest: str
    numpy: object


@dataclass(frozen=True)
class GridData:
    values: object
    latitudes: object
    longitudes: object


@dataclass(frozen=True)
class TileWriteRequest:
    level: object
    root: Path
    zoom: int
    x: int
    y: int
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

def render_tiles(request: TileRenderRequest) -> tuple[int, int]:
    """Reproject and interpolate a field on a bounded Web Mercator pixel grid."""
    import numpy as np
    from PIL import Image
    from pyproj import Transformer
    values, latitudes, longitudes, root, stops = request.values, request.latitudes, request.longitudes, request.root, request.stops
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    x, y = transformer.transform(longitudes, latitudes)
    x, y = np.asarray(x), np.asarray(y)
    valid = valid_data(values) & np.isfinite(x) & np.isfinite(y) & (np.abs(latitudes) <= WEB_MERCATOR_LIMIT)
    stride = max(1, math.ceil(math.sqrt(np.count_nonzero(valid) / 30_000)))
    values, x, y, valid = (np.asarray(array)[::stride, ::stride] for array in (values, x, y, valid))
    if not valid.any():
        raise ValueError("decoded field has no projectable values")
    extent = (-20037508.342789244, -20037508.342789244, 20037508.342789244, 20037508.342789244)
    span = extent[2] - extent[0]
    px = ((x - extent[0]) / span * (TILE_SIZE * 2**ZOOM_MAX)).astype(np.int64)
    py = ((extent[3] - y) / span * (TILE_SIZE * 2**ZOOM_MAX)).astype(np.int64)
    width = TILE_SIZE * 2**ZOOM_MAX
    height = width
    inside = valid & (px >= 0) & (px < width) & (py >= 0) & (py < height)
    if not inside.any():
        raise ValueError("decoded field does not overlap the Web Mercator tile domain")
    rgba = resampled_rgba(RasterRequest(px[inside], py[inside], values[inside], width, height, stops))
    image = Image.fromarray(rgba, "RGBA")
    root.mkdir(parents=True, exist_ok=True)
    count, total = save_tiles(image, root)
    return count, total


def valid_data(values):
    import numpy as np
    array = np.asarray(values, dtype=float)
    valid = np.isfinite(array) & (np.abs(array) < 9e19)
    return valid & (array != 9999) & (array != -9999) & (array != 1e20)


def resampled_rgba(request: RasterRequest):
    import numpy as np
    from scipy.interpolate import griddata
    px, py, values = request.x, request.y, request.values
    width, height, stops = request.width, request.height, request.stops
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    inside = (px >= 0) & (px < width) & (py >= 0) & (py < height)
    if not inside.any():
        return rgba
    px, py, values = px[inside], py[inside], values[inside]
    x0, x1 = max(0, int(px.min())), min(width - 1, int(px.max()))
    y0, y1 = max(0, int(py.min())), min(height - 1, int(py.max()))
    grid_x, grid_y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    samples = griddata(np.column_stack((px, py)), values, (grid_x, grid_y), method="linear")
    mask = np.isfinite(samples)
    colors = interpolate_colors(samples, stops)
    rgba[y0:y1 + 1, x0:x1 + 1][mask, :3] = colors[mask, :3]
    rgba[y0:y1 + 1, x0:x1 + 1, 3][mask] = 190
    return rgba


def interpolate_colors(sample, stops):
    import numpy as np
    stop_values = np.asarray([stop[0] for stop in stops], dtype=float)
    stop_colors = np.asarray([hex_rgb(stop[1]) for stop in stops], dtype=float)
    sample = np.nan_to_num(sample, nan=stop_values[0])
    index = np.clip(np.searchsorted(stop_values, sample, side="right") - 1, 0, len(stops) - 2)
    fraction = np.clip((sample - stop_values[index]) / (stop_values[index + 1] - stop_values[index]), 0, 1)
    colors = np.rint(stop_colors[index] + (stop_colors[index + 1] - stop_colors[index]) * fraction[..., None]).astype(np.uint8)
    return np.concatenate((colors, np.full(sample.shape + (1,), 190, dtype=np.uint8)), axis=-1)


def save_tiles(image, root):
    from PIL import Image
    count, total = 0, 0
    for zoom in range(ZOOM_MIN, ZOOM_MAX + 1):
        count_zoom, bytes_zoom = save_zoom_tiles(image, root, zoom, Image)
        count += count_zoom
        total += bytes_zoom
    return count, total


def save_zoom_tiles(image, root: Path, zoom: int, image_module) -> tuple[int, int]:
    scale = 2 ** (ZOOM_MAX - zoom)
    level = resized_level(image, zoom, scale, image_module)
    count, total = 0, 0
    for tx in range(2**zoom):
        for ty in range(2**zoom):
            size = save_tile(TileWriteRequest(level, root, zoom, tx, ty))
            if size:
                count += 1
                total += size
    return count, total


def resized_level(image, zoom: int, scale: int, image_module):
    if scale <= 1:
        return image
    return image.resize((TILE_SIZE * 2**zoom, TILE_SIZE * 2**zoom), image_module.Resampling.BOX)


def save_tile(request: TileWriteRequest) -> int:
    level, root, zoom, tx, ty = request.level, request.root, request.zoom, request.x, request.y
    tile = level.crop((tx*TILE_SIZE, ty*TILE_SIZE, (tx+1)*TILE_SIZE, (ty+1)*TILE_SIZE))
    if tile.getbbox() is None:
        return 0
    path = root / str(zoom) / str(tx) / f"{ty}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    tile.save(path, format="PNG", optimize=True)
    return path.stat().st_size

def handle_latlon(handle):
    import numpy as np
    from eccodes import codes_get_array
    return np.asarray(codes_get_array(handle, "latitudes")), np.asarray(codes_get_array(handle, "longitudes"))

@dataclass(frozen=True)
class CycleContext:
    model: Model
    cycle: datetime
    source_url: str
    modified: str
    output: Path


def process_f00(context: CycleContext) -> dict:
    """Run the isolated f00 stages and return the completed render result."""
    from . import render_steps
    result = render_steps.process(context, decode_range, render_tiles, combine_wind)
    return {"catalog": result.catalog, "tiles": result.tiles, "metrics": result.metrics}



def combine_wind(field_outputs, np):
    components = field_outputs.pop("wind-speed-10m", [])
    u = next((part for part in components if part["record"].get("parameter") == "UGRD"), None)
    v = next((part for part in components if part["record"].get("parameter") == "VGRD"), None)
    if u is None or v is None:
        return field_outputs
    require_matching_wind_grids(u, v, np)
    u["values"] = np.hypot(u["values"], v["values"])
    sources = [u, v]
    u["sourceInputs"] = [{"parameter": part["record"].get("parameter"), "message": part["record"], "sha256": part["sourceHash"], "bytes": part["sourceBytes"]} for part in sources]
    u["sourceHash"] = hashlib.sha256("".join(part["sourceHash"] for part in sources).encode("ascii")).hexdigest()
    u["sourceBytes"] = sum(part["sourceBytes"] for part in sources)
    field_outputs["wind-speed-10m"] = [u]
    return field_outputs


def require_matching_wind_grids(u: dict, v: dict, np) -> None:
    if not matching_shapes(u, v, np):
        raise ValueError("10 m U/V wind grids have different shapes")
    if not any_wind_coordinates(u, v):
        return
    if not complete_wind_coordinates(u, v):
        raise ValueError("10 m U/V wind grid coordinates are incomplete")
    if not matching_coordinates(u, v, np):
        raise ValueError("10 m U/V wind grids are not aligned")


def matching_shapes(u: dict, v: dict, np) -> bool:
    return np.shape(u["values"]) == np.shape(v["values"])


def any_wind_coordinates(u: dict, v: dict) -> bool:
    return has_wind_coordinates(u) or has_wind_coordinates(v)


def complete_wind_coordinates(u: dict, v: dict) -> bool:
    return has_wind_coordinates(u) and has_wind_coordinates(v)


def has_wind_coordinates(component: dict) -> bool:
    return "lats" in component and "lons" in component


def matching_coordinates(u: dict, v: dict, np) -> bool:
    return np.allclose(u["lats"], v["lats"]) and np.allclose(u["lons"], v["lons"])


def decode_range(request: DecodeRequest):
    content, field_ids, offset, ranged, digest = request.content, request.field_ids, request.offset, request.ranged, request.digest
    from eccodes import codes_get, codes_get_values, codes_grib_new_from_file, codes_grib_multi_support_off, codes_grib_multi_support_on, codes_release
    with tempfile.NamedTemporaryFile(delete=False) as temporary:
        temporary.write(content)
        path = temporary.name
    codes_grib_multi_support_on()
    try:
        decoded = read_grib_range(path, request, codes_grib_new_from_file, codes_release)
    finally:
        codes_grib_multi_support_off()
        os.unlink(path)
    if not decoded:
        raise ValueError(f"no selected fields decoded from GRIB range at {offset}")
    return decoded


def read_grib_range(path: str, request: DecodeRequest, new_handle, release) -> list:
    if os.name == "nt":
        return read_windows_grib_file(path, request, new_handle, release)
    with open(path, "rb") as stream:
        return read_stream_handles(stream, request, new_handle, release)


def read_stream_handles(stream, request: DecodeRequest, new_handle, release) -> list:
    decoded = []
    while handle := new_handle(stream):
        try:
            decoded.extend(decode_handle(handle, request))
        finally:
            release(handle)
    return decoded


def read_windows_grib_file(path: str, request: DecodeRequest, new_handle, release) -> list:
    # Windows ecCodes wheels use UCRT's FILE ABI for multi-field GRIB iteration.
    from gribapi.bindings import ffi
    library = ctypes.CDLL("ucrtbase.dll")
    library.fopen.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
    library.fopen.restype = ctypes.c_void_p
    library.fclose.argtypes = [ctypes.c_void_p]
    file_pointer = library.fopen(os.fsencode(path), b"rb")
    if not file_pointer:
        raise OSError(f"could not open temporary GRIB range at {request.offset}")
    try:
        stream = ffi.cast("FILE *", file_pointer)
        return read_stream_handles(stream, request, new_handle, release)
    finally:
        library.fclose(file_pointer)


def decode_handle(handle, request: DecodeRequest):
    from eccodes import codes_get, codes_get_values
    np = request.numpy
    values = np.asarray(codes_get_values(handle), dtype=float)
    values = np.where(valid_data(values) & (values != codes_get(handle, "missingValue")), values, np.nan)
    ni, nj = int(codes_get(handle, "Ni")), int(codes_get(handle, "Nj"))
    if values.size != ni * nj:
        raise ValueError(f"decoded grid shape mismatch: {values.size} values, {ni}x{nj}")
    lats, lons = handle_latlon(handle)
    values, lats, lons = values.reshape((nj, ni)), lats.reshape((nj, ni)), lons.reshape((nj, ni))
    parameter = codes_get(handle, "shortName")
    param_id = codes_get(handle, "paramId")
    native_parameter = native_identity(parameter, param_id)
    matching = matched_field_ids(request.field_ids, native_parameter)
    if not matching:
        matching = verified_single_field(request)
    record_parameter = resolved_record_parameter(matching, native_parameter)
    record = source_record(request, record_parameter)
    grid = GridData(values, lats, lons)
    return [decoded_field(fid.split(":", 1)[0], request, grid, record) for fid in matching]


def native_identity(parameter: str, param_id: int) -> str:
    short_names = {"10u": "UGRD", "u10": "UGRD", "10v": "VGRD", "v10": "VGRD"}
    return {165: "UGRD", 166: "VGRD"}.get(param_id, short_names.get(parameter, parameter))


def matched_field_ids(field_ids: list[str], parameter: str) -> list[str]:
    return [field_id for field_id in field_ids if field_id.rsplit(":", 1)[-1] == parameter]


def verified_single_field(request: DecodeRequest) -> list[str]:
    if len(request.field_ids) != 1:
        return []
    field_parameter = request.field_ids[0].rsplit(":", 1)[-1]
    matches = [row for row, _ in request.ranged if row.offset == request.offset and row.parameter == field_parameter]
    return request.field_ids if matches else []


def resolved_record_parameter(matches: list[str], parameter: str) -> str:
    return matches[0].rsplit(":", 1)[-1] if len(matches) == 1 else parameter


def source_record(request: DecodeRequest, parameter: str) -> dict:
    return next((asdict(row) for row, _ in request.ranged if row.offset == request.offset and row.parameter == parameter), {})


def decoded_field(field_id: str, request: DecodeRequest, grid: GridData, record: dict) -> tuple[str, dict]:
    operation = FIELDS[field_id][5]
    converted = VALUE_CONVERSIONS.get(operation, identity_conversion)(grid.values)
    item = {"values": converted, "lats": grid.latitudes, "lons": grid.longitudes, "sourceHash": request.digest, "sourceBytes": len(request.content), "record": record}
    return field_id, item


def identity_conversion(values):
    return values
