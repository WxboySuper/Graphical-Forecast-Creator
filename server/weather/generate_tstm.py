#!/usr/bin/env python
"""Generate editable TSTM GeoJSON polygons from HREF guidance.

Input is a small JSON object on stdin. Output is a JSON response on stdout.
The helper intentionally returns warnings with partial/empty output instead of
failing when a HREF field is unavailable for a particular run/product.
"""

from __future__ import annotations

import json
import math
import os
import sys
import warnings
from contextlib import redirect_stdout
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlretrieve

os.environ.setdefault("MKL_THREADING_LAYER", "SEQUENTIAL")
import numpy as np


HREF_MAX_FORECAST_HOUR = 48
HREF_CYCLE_HOURS = (0, 6, 12, 18)
DEFAULT_DOMAIN = "conus"
FORECAST_HOUR_STEP = max(1, int(os.environ.get("TSTM_HREF_HOUR_STEP", "3")))
MAX_FORECAST_HOURS = max(1, int(os.environ.get("TSTM_HREF_MAX_HOURS", "17")))
ENABLE_LIGHTNING_SEARCH = os.environ.get("TSTM_ENABLE_LIGHTNING_SEARCH", "true").lower() != "false"
SPC_POST_BASE_URL = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/spc_post/prod"
SPC_THUNDER_PERIODS = ("full", "4hr", "1hr")
HREF_PRODUCTS = {
    "qpf": ["lpmm", "avrg", "prob", "mean"],
    "reflectivity": ["prob", "mean", "pmmn"],
    "instability": ["mean", "prob"],
    "lightning": ["prob"],
}
DEFAULT_THRESHOLDS = {
    "calibratedThunderCoreProbability": 0.30,
    "calibratedThunderSupportProbability": 0.10,
    "lightningProbability": 0.25,
    "qpfProbability": 0.50,
    "reflectivityProbability": 0.40,
    "qpfInches": 0.01,
    "capeJkg": 500.0,
    "cinJkg": 150.0,
    "reflectivityDbz": 35.0,
    "minAreaSqKm": 500.0,
}


@dataclass(frozen=True)
class EffectiveWindow:
    start: datetime
    end: datetime
    href_run: datetime
    forecast_hours: list[int]


@dataclass(frozen=True)
class HrefSignal:
    values: np.ndarray
    template: Any
    product: str
    search: str


@dataclass(frozen=True)
class SpcThunderSignal:
    values: np.ndarray
    template: Any
    run: datetime
    period: str
    forecast_hours: list[int]
    urls: list[str]


def read_payload() -> dict[str, Any]:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("Request payload must be valid JSON.") from exc


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def parse_cycle_date(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def parse_issuance_time(value: str | None) -> tuple[int, int]:
    if not value or len(value) < 4 or not value[:4].isdigit():
        return 6, 0
    return int(value[:2]), int(value[2:4])


def previous_href_cycle(value: datetime) -> datetime:
    value = value.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    for cycle_hour in reversed(HREF_CYCLE_HOURS):
        if value.hour >= cycle_hour:
            return value.replace(hour=cycle_hour)
    return (value - timedelta(days=1)).replace(hour=18)


def previous_spc_cycle(value: datetime) -> datetime:
    value = value.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    if value.hour >= 12:
        return value.replace(hour=12)
    return value.replace(hour=0)


def previous_12_hour_run(run: datetime) -> datetime:
    return run - timedelta(hours=12)


def build_forecast_hours(start: datetime, end: datetime, run: datetime) -> list[int]:
    first_hour = max(1, math.floor((start - run).total_seconds() / 3600))
    last_hour = min(HREF_MAX_FORECAST_HOUR, math.ceil((end - run).total_seconds() / 3600))
    if last_hour < first_hour:
        return []
    forecast_hours = list(range(first_hour, last_hour + 1, FORECAST_HOUR_STEP))
    if last_hour not in forecast_hours:
        forecast_hours.append(last_hour)
    forecast_hours = sorted(set(forecast_hours))
    if len(forecast_hours) > MAX_FORECAST_HOURS:
        sampled_hours = forecast_hours[: max(0, MAX_FORECAST_HOURS - 1)]
        forecast_hours = sorted(set(sampled_hours + [last_hour]))
    return forecast_hours


def build_effective_window(payload: dict[str, Any]) -> EffectiveWindow:
    day = int(payload.get("day", 0))
    if day not in (1, 2):
        raise ValueError("HREF-based TSTM generation is only available for Day 1 and Day 2.")

    cycle_start = parse_cycle_date(str(payload.get("cycleDate", "")))
    issue_date = parse_iso_datetime(payload.get("issueDate"))
    valid_date = parse_iso_datetime(payload.get("validDate"))
    issue_hour, issue_minute = parse_issuance_time(payload.get("issuanceTime"))

    if day == 1:
        start = valid_date or issue_date or cycle_start.replace(hour=issue_hour, minute=issue_minute)
        end = (cycle_start + timedelta(days=1)).replace(hour=12, minute=0)
        href_run = previous_spc_cycle(start)
    else:
        start = (cycle_start + timedelta(days=1)).replace(hour=12, minute=0)
        end = (cycle_start + timedelta(days=2)).replace(hour=12, minute=0)
        href_run = cycle_start.replace(hour=12, minute=0)

    forecast_hours = build_forecast_hours(start, end, href_run)

    return EffectiveWindow(start=start, end=end, href_run=href_run, forecast_hours=forecast_hours)


def get_first_data_array(dataset: Any) -> Any | None:
    if isinstance(dataset, list):
        for item in dataset:
            data_array = get_first_data_array(item)
            if data_array is not None:
                return data_array
        return None

    for data_array in getattr(dataset, "data_vars", {}).values():
        values = np.asarray(data_array.values)
        if values.size > 0:
            return data_array
    return None


def normalize_values(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    if values.ndim > 2:
        values = np.nanmax(values, axis=tuple(range(values.ndim - 2)))
    return values


def cache_root() -> Path:
    return Path(os.environ.get("HERBIE_DIR") or Path(__file__).resolve().parents[1] / "cache" / "herbie")


def configure_conda_grib_runtime() -> None:
    conda_root = Path(sys.executable).resolve().parent
    library_dir = conda_root / "Library"
    library_bin = library_dir / "bin"
    os.environ.setdefault("ECCODES_DIR", str(library_dir))
    if library_bin.exists():
        os.environ["PATH"] = f"{library_bin}{os.pathsep}{os.environ.get('PATH', '')}"
        if hasattr(os, "add_dll_directory"):
            os.add_dll_directory(str(library_bin))


def spc_thunder_url(run: datetime, forecast_hour: int, period: str) -> tuple[str, str]:
    date_part = run.strftime("%Y%m%d")
    hour_part = run.strftime("%H")
    filename = f"spc_post.t{hour_part}z.hrefct_{period}.f{forecast_hour:03d}.grib2"
    url = f"{SPC_POST_BASE_URL}/spc_post.{date_part}/thunder/{filename}"
    return url, filename


def download_spc_thunder(run: datetime, forecast_hour: int, period: str) -> tuple[Path, str]:
    url, filename = spc_thunder_url(run, forecast_hour, period)
    destination = cache_root() / "spc_post" / run.strftime("%Y%m%d") / "thunder" / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 0:
        return destination, url
    try:
        print(f"downloading SPC calibrated thunder {period} f{forecast_hour:03d}: {url}", file=sys.stderr, flush=True)
        urlretrieve(url, destination)
    except (HTTPError, URLError, OSError):
        if destination.exists():
            destination.unlink()
        raise
    return destination, url


def open_spc_thunder(path: Path) -> Any:
    configure_conda_grib_runtime()
    import cfgrib

    datasets = cfgrib.open_datasets(path, backend_kwargs={"indexpath": "", "errors": "raise"})
    dataset = datasets[0] if isinstance(datasets, list) else datasets
    if "tstm" in getattr(dataset, "data_vars", {}):
        return dataset["tstm"].squeeze()
    data_array = get_first_data_array(dataset)
    if data_array is None:
        raise ValueError(f"No calibrated thunder field found in {path.name}.")
    return data_array.squeeze()


def load_spc_thunder_hour(run: datetime, forecast_hour: int, period: str) -> tuple[Any, str]:
    path, url = download_spc_thunder(run, forecast_hour, period)
    return open_spc_thunder(path), url


def data_array_valid_time(data_array: Any) -> datetime | None:
    if "valid_time" not in getattr(data_array, "coords", {}):
        return None
    try:
        return np.datetime64(data_array.coords["valid_time"].values).astype("datetime64[us]").astype(datetime).replace(
            tzinfo=timezone.utc
        )
    except Exception:
        return None


def spc_candidate_windows(window: EffectiveWindow) -> list[EffectiveWindow]:
    candidates: list[EffectiveWindow] = []
    for run in (window.href_run, previous_12_hour_run(window.href_run)):
        forecast_hours = build_forecast_hours(window.start, window.end, run)
        if forecast_hours:
            candidates.append(replace(window, href_run=run, forecast_hours=forecast_hours))
    return candidates


def fetch_spc_period_for_window(window: EffectiveWindow, period: str) -> SpcThunderSignal | None:
    end_hour = window.forecast_hours[-1]
    if period == "full":
        hours = sorted(set([max(1, end_hour - 23), end_hour]))
    elif period == "4hr":
        hours = sorted(set([max(1, end_hour - 3), end_hour]))
    else:
        hours = [end_hour]
    expected_valid_time = window.href_run + timedelta(hours=end_hour)
    arrays: list[np.ndarray] = []
    matched_hours: list[int] = []
    urls: list[str] = []
    template = None
    for forecast_hour in hours:
        try:
            data_array, url = load_spc_thunder_hour(window.href_run, forecast_hour, period)
        except (HTTPError, URLError, OSError, ValueError) as exc:
            print(
                f"SPC calibrated thunder miss: run={window.href_run:%Y-%m-%d %HZ} "
                f"period={period} f{forecast_hour:03d} {type(exc).__name__}: {exc}",
                file=sys.stderr,
                flush=True,
            )
            continue
        valid_time = data_array_valid_time(data_array)
        print(
            f"[tstm:spc] checked SPC calibrated thunder: run={window.href_run:%Y-%m-%d %HZ} "
            f"period={period} f{forecast_hour:03d} "
            f"grib_valid={valid_time.isoformat() if valid_time else 'unknown'} "
            f"expected_valid={expected_valid_time.isoformat()}",
            file=sys.stderr,
            flush=True,
        )
        if valid_time is not None and abs((valid_time - expected_valid_time).total_seconds()) > 3600:
            continue
        if template is None:
            template = data_array
        arrays.append(normalize_values(np.asarray(data_array.values)))
        matched_hours.append(forecast_hour)
        urls.append(url)
        if period == "full":
            break
    if arrays and template is not None:
        print(
            f"matched SPC calibrated thunder: run={window.href_run:%Y-%m-%d %HZ}, "
            f"period={period}, hours={matched_hours}",
            file=sys.stderr,
            flush=True,
        )
        return SpcThunderSignal(
            values=np.nanmax(np.stack(arrays), axis=0),
            template=template,
            run=window.href_run,
            period=period,
            forecast_hours=[end_hour],
            urls=urls,
        )
    return None


def fetch_spc_calibrated_thunder(window: EffectiveWindow) -> tuple[SpcThunderSignal | None, list[str]]:
    warnings: list[str] = []
    candidates = spc_candidate_windows(window)
    if not candidates:
        return None, warnings

    for period in SPC_THUNDER_PERIODS:
        for candidate in candidates:
            signal = fetch_spc_period_for_window(candidate, period)
            if signal is not None:
                if candidate.href_run != window.href_run:
                    warnings.append(
                        f"Latest SPC calibrated thunder run was incomplete; used "
                        f"{candidate.href_run:%Y-%m-%d %HZ} instead."
                    )
                return signal, warnings

    warnings.append("No SPC calibrated HREF thunder field was available; falling back to public HREF ingredients.")
    return None, warnings


def fetch_href_field(
    run: datetime,
    forecast_hours: list[int],
    products: list[str],
    searches: list[str],
    label: str,
    required: bool = False,
) -> tuple[HrefSignal | None, list[str]]:
    warnings: list[str] = []
    arrays: list[np.ndarray] = []
    template = None
    matched_product = ""
    matched_search = ""

    try:
        from herbie import Herbie
    except Exception as exc:  # pragma: no cover - depends on deployment env
        raise RuntimeError("Python dependency 'herbie-data' is not installed for the server runtime.") from exc

    print(
        f"fetching {label}: products={products}, searches={searches}, hours={forecast_hours}",
        file=sys.stderr,
        flush=True,
    )

    for forecast_hour in forecast_hours:
        hour_arrays: list[np.ndarray] = []
        for product in products:
            for search in searches:
                try:
                    with redirect_stdout(sys.stderr):
                        href = Herbie(
                            run.strftime("%Y-%m-%d %H:%M"),
                            model="href",
                            product=product,
                            domain=DEFAULT_DOMAIN,
                            fxx=forecast_hour,
                        )
                        dataset = href.xarray(search=search, remove_grib=False)
                    data_array = get_first_data_array(dataset)
                    if data_array is None:
                        continue
                    if template is None:
                        template = data_array
                        matched_product = product
                        matched_search = search
                    hour_arrays.append(normalize_values(np.asarray(data_array.values)))
                    break
                except Exception:
                    continue
            if hour_arrays:
                break
        if hour_arrays:
            arrays.append(np.nanmax(np.stack(hour_arrays), axis=0))

    if not arrays:
        if required:
            warnings.append(f"No HREF {label} field matched available searches.")
        print(f"no match for {label}", file=sys.stderr, flush=True)
        return None, warnings

    print(
        f"matched {label}: product={matched_product}, search={matched_search}, hours={len(arrays)}",
        file=sys.stderr,
        flush=True,
    )
    return HrefSignal(
        values=np.nanmax(np.stack(arrays), axis=0),
        template=template,
        product=matched_product,
        search=matched_search,
    ), warnings


def as_probability(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    return values / 100.0 if np.nanmax(values) > 1 else values


def finite_threshold(values: np.ndarray, threshold: float) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    return np.isfinite(values) & (values >= threshold)


def finite_greater_than(values: np.ndarray, threshold: float) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    return np.isfinite(values) & (values > threshold)


def calibrated_thunder_mask(
    probability: np.ndarray,
    clip_mask: np.ndarray | None = None,
    lat: np.ndarray | None = None,
    lon: np.ndarray | None = None,
) -> np.ndarray:
    from skimage import filters, measure, morphology

    values = np.nan_to_num(np.asarray(probability, dtype=float), nan=0.0)
    smoothed = filters.gaussian(values, sigma=1.0, preserve_range=True)
    support = finite_threshold(smoothed, DEFAULT_THRESHOLDS["calibratedThunderSupportProbability"])
    if clip_mask is not None:
        support &= clip_mask
    core = finite_greater_than(smoothed, DEFAULT_THRESHOLDS["calibratedThunderCoreProbability"]) & support
    if not np.any(core):
        return np.zeros(values.shape, dtype=bool)

    labels = measure.label(support, connectivity=2)
    keep_labels = np.unique(labels[core])
    keep_labels = keep_labels[keep_labels != 0]
    if keep_labels.size == 0:
        return core

    mask = np.isin(labels, keep_labels)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FutureWarning)
        mask = morphology.closing(mask, morphology.disk(3))
        mask = morphology.remove_small_holes(mask, 64)
        mask = morphology.remove_small_objects(mask, 12)
    if lat is not None and lon is not None:
        log_calibrated_thunder_components(values, smoothed, support, core, mask, lat, lon)
    return mask


def log_calibrated_thunder_components(
    raw_probability: np.ndarray,
    smoothed_probability: np.ndarray,
    support: np.ndarray,
    core: np.ndarray,
    mask: np.ndarray,
    lat: np.ndarray,
    lon: np.ndarray,
) -> None:
    from skimage import measure

    finite = raw_probability[np.isfinite(raw_probability)]
    if finite.size:
        percentiles = np.nanpercentile(finite, [50, 75, 90, 95, 99])
        print(
            "[tstm:spc] calibrated thunder stats "
            f"shape={raw_probability.shape} "
            f"lat={float(np.nanmin(lat)):.2f}..{float(np.nanmax(lat)):.2f} "
            f"lon={float(np.nanmin(lon)):.2f}..{float(np.nanmax(lon)):.2f} "
            f"min={float(np.nanmin(finite)):.3f} max={float(np.nanmax(finite)):.3f} "
            f"p50/p75/p90/p95/p99={','.join(f'{value:.3f}' for value in percentiles)}",
            file=sys.stderr,
            flush=True,
        )

    labels = measure.label(support, connectivity=2)
    print(
        "[tstm:spc] calibrated thunder mask "
        f"support_cells={int(np.count_nonzero(support))} "
        f"core_cells={int(np.count_nonzero(core))} "
        f"kept_cells={int(np.count_nonzero(mask))} "
        f"support_components={int(labels.max())}",
        file=sys.stderr,
        flush=True,
    )
    for label in range(1, labels.max() + 1):
        component = labels == label
        cell_count = int(np.count_nonzero(component))
        if cell_count < 5:
            continue
        component_lat = lat[component]
        component_lon = lon[component]
        component_raw = raw_probability[component]
        component_smooth = smoothed_probability[component]
        is_kept = bool(np.any(mask & component))
        print(
            "[tstm:spc] component "
            f"id={label} kept={str(is_kept).lower()} cells={cell_count} "
            f"bounds=({float(np.nanmin(component_lon)):.2f},"
            f"{float(np.nanmin(component_lat)):.2f},"
            f"{float(np.nanmax(component_lon)):.2f},"
            f"{float(np.nanmax(component_lat)):.2f}) "
            f"raw_max={float(np.nanmax(component_raw)):.3f} "
            f"smooth_max={float(np.nanmax(component_smooth)):.3f}",
            file=sys.stderr,
            flush=True,
        )


def threshold_signal(signal: HrefSignal | None, threshold: float) -> np.ndarray | None:
    if signal is None:
        return None
    values = signal.values
    if signal.product == "prob":
        return as_probability(values) >= DEFAULT_THRESHOLDS["lightningProbability"]
    return finite_threshold(values, threshold)


def get_lat_lon(template: Any) -> tuple[np.ndarray, np.ndarray]:
    if template is None:
        raise ValueError("No HREF template grid is available.")

    lat = None
    lon = None
    for name in ("latitude", "lat"):
        if hasattr(template, name):
            lat = np.asarray(getattr(template, name).values)
            break
        if name in getattr(template, "coords", {}):
            lat = np.asarray(template.coords[name].values)
            break
    for name in ("longitude", "lon"):
        if hasattr(template, name):
            lon = np.asarray(getattr(template, name).values)
            break
        if name in getattr(template, "coords", {}):
            lon = np.asarray(template.coords[name].values)
            break

    if lat is None or lon is None:
        raise ValueError("Unable to locate latitude/longitude coordinates in HREF data.")

    if lon.max() > 180:
        lon = ((lon + 180) % 360) - 180
    return lat, lon


def grid_point_to_lon_lat(lat: np.ndarray, lon: np.ndarray, row: float, col: float) -> tuple[float, float]:
    max_row = lat.shape[0] - 1
    max_col = lat.shape[1] - 1
    r0 = int(np.clip(math.floor(row), 0, max_row))
    c0 = int(np.clip(math.floor(col), 0, max_col))
    return float(lon[r0, c0]), float(lat[r0, c0])


def clean_mask(mask: np.ndarray) -> np.ndarray:
    from skimage import morphology

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FutureWarning)
        cleaned = morphology.remove_small_objects(mask.astype(bool), 8)
        cleaned = morphology.closing(cleaned, morphology.disk(2))
        cleaned = morphology.opening(cleaned, morphology.disk(1))
        cleaned = morphology.remove_small_holes(cleaned, 36)
        cleaned = morphology.remove_small_objects(cleaned, 12)
    cleaned[0, :] = False
    cleaned[-1, :] = False
    cleaned[:, 0] = False
    cleaned[:, -1] = False
    return cleaned


def conus_land_clip_geometry() -> Any:
    from shapely.geometry import Polygon

    return Polygon(
        [
            (-124.8, 48.9),
            (-122.8, 49.0),
            (-117.0, 49.1),
            (-111.0, 49.1),
            (-104.0, 49.0),
            (-96.0, 49.0),
            (-89.0, 48.8),
            (-82.5, 46.4),
            (-75.0, 44.9),
            (-67.0, 47.3),
            (-66.8, 45.0),
            (-69.0, 43.5),
            (-70.5, 42.5),
            (-72.8, 41.1),
            (-74.8, 40.3),
            (-75.5, 38.8),
            (-76.2, 36.6),
            (-77.6, 34.6),
            (-79.0, 33.1),
            (-80.4, 31.0),
            (-81.0, 29.6),
            (-80.4, 27.6),
            (-80.0, 25.2),
            (-81.1, 24.5),
            (-82.8, 24.7),
            (-83.2, 25.8),
            (-83.2, 27.0),
            (-82.8, 28.1),
            (-83.3, 29.2),
            (-84.7, 29.8),
            (-86.0, 30.2),
            (-87.6, 30.3),
            (-89.2, 30.1),
            (-91.4, 29.2),
            (-93.7, 29.7),
            (-95.7, 29.2),
            (-97.2, 25.8),
            (-99.2, 26.4),
            (-100.4, 28.4),
            (-101.8, 29.0),
            (-103.2, 29.0),
            (-104.9, 30.2),
            (-106.5, 31.8),
            (-111.1, 31.3),
            (-114.8, 32.7),
            (-117.2, 32.5),
            (-119.8, 34.1),
            (-121.2, 36.4),
            (-122.6, 38.1),
            (-124.0, 41.6),
            (-124.6, 45.6),
            (-124.8, 48.9),
        ]
    ).buffer(0)


def smooth_and_clip_geometry(geometry: Any) -> Any:
    clip = conus_land_clip_geometry()
    smoothed = smooth_geometry(geometry)
    smoothed = smoothed.buffer(0.45, join_style=1).buffer(-0.32, join_style=1)
    smoothed = smooth_geometry(smoothed)
    smoothed = smoothed.simplify(0.08, preserve_topology=True)
    return smoothed.intersection(clip).buffer(0)


def chaikin_ring(coordinates: list[tuple[float, float]], iterations: int = 2) -> list[tuple[float, float]]:
    if len(coordinates) < 4:
        return coordinates
    ring = coordinates[:-1] if coordinates[0] == coordinates[-1] else coordinates
    for _ in range(iterations):
        refined = []
        for index, point in enumerate(ring):
            next_point = ring[(index + 1) % len(ring)]
            refined.append((0.75 * point[0] + 0.25 * next_point[0], 0.75 * point[1] + 0.25 * next_point[1]))
            refined.append((0.25 * point[0] + 0.75 * next_point[0], 0.25 * point[1] + 0.75 * next_point[1]))
        ring = refined
    return ring + [ring[0]]


def smooth_geometry(geometry: Any) -> Any:
    from shapely.geometry import MultiPolygon, Polygon

    if geometry.is_empty:
        return geometry
    if geometry.geom_type == "Polygon":
        exterior = chaikin_ring(list(geometry.exterior.coords), 2)
        holes = [chaikin_ring(list(interior.coords), 1) for interior in geometry.interiors]
        return Polygon(exterior, holes).buffer(0)
    if geometry.geom_type == "MultiPolygon":
        return MultiPolygon([smooth_geometry(part) for part in geometry.geoms if not part.is_empty]).buffer(0)
    return geometry


def grid_land_mask(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    from shapely import contains_xy

    return contains_xy(conus_land_clip_geometry(), lon, lat)


def grid_near_land_mask(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    from shapely import contains_xy

    return contains_xy(conus_land_clip_geometry().buffer(0.75, join_style=1), lon, lat)


def mask_to_features(mask: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> list[dict[str, Any]]:
    from shapely.geometry import Polygon, mapping
    from shapely.ops import unary_union
    from skimage import measure

    contours = measure.find_contours(clean_mask(mask).astype(float), 0.5)
    polygons = []
    for contour in contours:
        coordinates = [grid_point_to_lon_lat(lat, lon, row, col) for row, col in contour]
        if len(coordinates) < 4:
            continue
        polygon = Polygon(coordinates)
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        if polygon.is_empty:
            continue
        polygons.append(polygon.simplify(0.08, preserve_topology=True))

    if not polygons:
        return []

    merged = unary_union(polygons)
    merged = smooth_and_clip_geometry(merged)
    if merged.is_empty:
        return []

    if merged.geom_type == "Polygon":
        geometries = [merged]
    else:
        geometries = list(getattr(merged, "geoms", []))

    features = []
    for index, geometry in enumerate(geometries):
        if geometry.is_empty:
            continue
        if geometry.area < 0.08:
            continue
        features.append(
            {
                "type": "Feature",
                "id": f"href-tstm-{index}",
                "geometry": mapping(geometry),
                "properties": {
                    "outlookType": "categorical",
                    "probability": "TSTM",
                    "isSignificant": False,
                    "derivedFrom": "href-auto-tstm",
                },
            }
        )
    return features


def apply_template(template: Any | None, signal: HrefSignal | None) -> Any | None:
    if template is None and signal is not None:
        return signal.template
    return template


def build_response(payload: dict[str, Any]) -> dict[str, Any]:
    window = build_effective_window(payload)
    warnings: list[str] = []

    if not window.forecast_hours:
        warnings.append("The effective outlook window does not overlap HREF forecast hours 0-48.")
        return response_payload(window, [], warnings, {})

    print(
        f"effective window {window.start.isoformat()} to {window.end.isoformat()} "
        f"from HREF run {window.href_run.isoformat()} using hours {window.forecast_hours}",
        file=sys.stderr,
        flush=True,
    )

    calibrated_thunder, spc_warnings = fetch_spc_calibrated_thunder(window)
    warnings.extend(spc_warnings)
    if calibrated_thunder is not None:
        lat, lon = get_lat_lon(calibrated_thunder.template)
        probability = as_probability(calibrated_thunder.values)
        final_mask = calibrated_thunder_mask(probability, grid_near_land_mask(lat, lon), lat, lon)
        features = mask_to_features(final_mask, lat, lon)
        response_window = replace(
            window,
            href_run=calibrated_thunder.run,
            forecast_hours=calibrated_thunder.forecast_hours,
        )
        return response_payload(
            response_window,
            features,
            warnings,
            {
                "calibratedThunder": {
                    "product": f"spc_hrefct_{calibrated_thunder.period}",
                    "search": "tstm",
                    "run": calibrated_thunder.run.isoformat().replace("+00:00", "Z"),
                    "period": calibrated_thunder.period,
                    "forecastHours": ",".join(str(hour) for hour in calibrated_thunder.forecast_hours),
                    "url": calibrated_thunder.urls[0],
                },
            },
        )

    template = None
    lightning = None

    if ENABLE_LIGHTNING_SEARCH:
        lightning, lightning_warnings = fetch_href_field(
            window.href_run,
            window.forecast_hours,
            HREF_PRODUCTS["lightning"],
            [":LTNG:", ":LTNG", ":LTG:", ":LTG", ":LTP:", ":LTP", ":TSTM:", ":TSTM"],
            "lightning/thunder",
            required=False,
        )
        warnings.extend(lightning_warnings)
        template = apply_template(template, lightning)
    else:
        warnings.append("Lightning search skipped for speed; set TSTM_ENABLE_LIGHTNING_SEARCH=true to enable it.")

    qpf, qpf_warnings = fetch_href_field(
        window.href_run,
        window.forecast_hours,
        HREF_PRODUCTS["qpf"],
        [":APCP:"],
        "QPF",
        required=True,
    )
    warnings.extend(qpf_warnings)
    template = apply_template(template, qpf)

    reflectivity, ref_warnings = fetch_href_field(
        window.href_run,
        window.forecast_hours,
        HREF_PRODUCTS["reflectivity"],
        [":REFC:", ":REFD:", ":MAXREF:"],
        "reflectivity",
        required=False,
    )
    warnings.extend(ref_warnings)
    template = apply_template(template, reflectivity)

    cape, cape_warnings = fetch_href_field(
        window.href_run,
        window.forecast_hours,
        HREF_PRODUCTS["instability"],
        [":CAPE:"],
        "CAPE",
        required=False,
    )
    warnings.extend(cape_warnings)
    template = apply_template(template, cape)

    cin, cin_warnings = fetch_href_field(
        window.href_run,
        window.forecast_hours,
        HREF_PRODUCTS["instability"],
        [":CIN:"],
        "CIN",
        required=False,
    )
    warnings.extend(cin_warnings)
    template = apply_template(template, cin)

    if template is None:
        warnings.append("No usable HREF grid data was available for this effective period.")
        return response_payload(window, [], warnings, {})

    shape = normalize_values(np.asarray(template.values)).shape
    lightning_mask = np.zeros(shape, dtype=bool)
    qpf_mask = np.zeros(shape, dtype=bool)
    reflectivity_mask = np.zeros(shape, dtype=bool)
    cape_mask = np.zeros(shape, dtype=bool)

    if lightning is not None:
        if lightning.product == "prob":
            lightning_values = as_probability(lightning.values)
            lightning_mask = finite_threshold(lightning_values, DEFAULT_THRESHOLDS["lightningProbability"])
        else:
            lightning_mask = finite_threshold(lightning.values, 1)

    if qpf is not None:
        if qpf.product == "prob":
            qpf_mask = finite_threshold(as_probability(qpf.values), DEFAULT_THRESHOLDS["qpfProbability"])
        else:
            qpf_inches = qpf.values / 25.4 if np.nanmax(qpf.values) > 10 else qpf.values
            qpf_mask = finite_threshold(qpf_inches, DEFAULT_THRESHOLDS["qpfInches"])

    if reflectivity is not None:
        if reflectivity.product == "prob":
            reflectivity_mask = finite_threshold(
                as_probability(reflectivity.values),
                DEFAULT_THRESHOLDS["reflectivityProbability"],
            )
        else:
            ref_mask = threshold_signal(reflectivity, DEFAULT_THRESHOLDS["reflectivityDbz"])
            if ref_mask is not None:
                reflectivity_mask = ref_mask

    if cape is not None:
        thresholded_cape = threshold_signal(cape, DEFAULT_THRESHOLDS["capeJkg"])
        if thresholded_cape is not None:
            cape_mask = thresholded_cape
        if cin is not None:
            if cin.product == "prob":
                cape_mask &= finite_threshold(as_probability(cin.values), DEFAULT_THRESHOLDS["lightningProbability"])
            else:
                cape_mask &= np.isfinite(cin.values) & (np.abs(cin.values) <= DEFAULT_THRESHOLDS["cinJkg"])

    lightning_core = lightning_mask & (reflectivity_mask | cape_mask)
    ingredient_core = reflectivity_mask & cape_mask & (qpf_mask | lightning_mask)
    final_mask = lightning_core | ingredient_core
    if not lightning and not any((qpf, reflectivity, cape)):
        warnings.append("No HREF convection fields were available for this effective period.")
    lat, lon = get_lat_lon(template)
    features = mask_to_features(final_mask, lat, lon)
    sources = {
        "lightning": signal_source(lightning),
        "qpf": signal_source(qpf),
        "reflectivity": signal_source(reflectivity),
        "cape": signal_source(cape),
        "cin": signal_source(cin),
    }
    return response_payload(window, features, warnings, sources)


def signal_source(signal: HrefSignal | None) -> dict[str, str] | None:
    if signal is None:
        return None
    return {
        "product": signal.product,
        "search": signal.search,
    }


def response_payload(
    window: EffectiveWindow,
    features: list[dict[str, Any]],
    warnings: list[str],
    sources: dict[str, dict[str, Any] | None],
) -> dict[str, Any]:
    return {
        "features": features,
        "run": window.href_run.isoformat().replace("+00:00", "Z"),
        "domain": DEFAULT_DOMAIN,
        "forecastHours": window.forecast_hours,
        "effectiveStart": window.start.isoformat().replace("+00:00", "Z"),
        "effectiveEnd": window.end.isoformat().replace("+00:00", "Z"),
        "thresholds": DEFAULT_THRESHOLDS,
        "warnings": warnings,
        "sources": sources,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def main() -> int:
    try:
        payload = read_payload()
        print(json.dumps(build_response(payload)))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
