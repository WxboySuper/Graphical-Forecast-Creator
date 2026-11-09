"""Mesoscale ingest fields responsibilities."""

from __future__ import annotations

from dataclasses import dataclass
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

DISPLAY_NAMES = {
    "temperature-2m": "2 m temperature",
    "dewpoint-2m": "2 m dew point",
    "wind-speed-10m": "10 m wind speed",
    "cape-surface": "CAPE (surface)",
    "cin-surface": "CIN (surface)",
    "cape-180-0mb-agl": "CAPE (180–0 mb above ground)",
    "cape-90-0mb-agl": "CAPE (90–0 mb above ground)",
    "cape-255-0mb-agl": "CAPE (255–0 mb above ground)",
    "cape-0-3000m-agl": "CAPE (0–3000 m above ground)",
    "cin-180-0mb-agl": "CIN (180–0 mb above ground)",
    "cin-90-0mb-agl": "CIN (90–0 mb above ground)",
    "cin-255-0mb-agl": "CIN (255–0 mb above ground)",
    "srh-0-1km": "Storm-relative helicity, 0–1 km",
    "srh-0-3km": "Storm-relative helicity, 0–3 km",
    "surface-lcl": "LCL height (surface-based parcel)",
    "pwat": "Precipitable water",
    "mslp": "Mean sea level pressure",
    "reflectivity": "Composite reflectivity",
}


def display_name(field_id: str) -> str:
    """A forecaster-readable field name; unknown ids fall back to a title-cased id."""
    return DISPLAY_NAMES.get(field_id) or field_id.replace("-", " ").title()


def required_identities(model_id: str) -> list[list[dict[str, str]]]:
    return [identity for field_id, spec in FIELDS.items() for identity in identities_for_field(model_id, field_id, spec[0])]


def identities_for_field(model_id: str, field_id: str, records: dict[str, str]) -> list[list[dict[str, str]]]:
    if model_id == "rap" and field_id == "surface-lcl":
        return []
    group = [{"parameter": parameter, "level": required_level(model_id, field_id, level)} for parameter, level in records.items()]
    return [group] if field_id == "mslp" else [[identity] for identity in group]


def required_level(model_id: str, field_id: str, level: str) -> str:
    if model_id == "rrfs" and field_id == "reflectivity":
        return "entire atmosphere (considered as a single layer)"
    return level

def source_metadata(model: Model) -> dict:
    link = "https://registry.opendata.aws/noaa-rrfs-ops/" if model.id == "rrfs" else f"https://registry.opendata.aws/{model.dataset_id}/"
    return {"providerId": "noaa-open-data", "providerName": "NOAA Open Data on AWS", "datasetId": model.dataset_id, "attribution": f"NOAA/NCEP {model.name} ({model.id.upper()})", "url": link}
