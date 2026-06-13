#!/usr/bin/env python
"""Probe NOMADS HREF filter metadata without downloading GRIB data."""

from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta, timezone
from html import unescape
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener


DATASET_URL = "https://nomads.ncep.noaa.gov/gribfilter.php?ds=hrefpr"
FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_href.pl"
PRODUCTS = ("mean", "prob", "lpmm", "pmmn", "avrg", "sprd", "eas")
PARAMETERS = ("APCP", "CAPE", "CIN", "LTNG", "MAXREF", "REFC", "REFD")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "GFC-HREF-inventory-probe/1.0"})
    opener = build_opener(NoRedirect)
    with opener.open(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def latest_cycle() -> tuple[str, int]:
    now = datetime.now(timezone.utc) - timedelta(hours=3)
    cycle = max(hour for hour in (0, 6, 12, 18) if hour <= now.hour)
    return now.strftime("%Y%m%d"), cycle


def extract_available_dates(page: str) -> list[str]:
    return re.findall(r"href\.(\d{8})", page)


def filter_url(date: str, cycle: int, product: str, forecast_hour: int, parameter: str) -> str:
    file_name = f"href.t{cycle:02d}z.conus.{product}.f{forecast_hour:02d}.grib2"
    return (
        f"{FILTER_URL}?dir=/href.{date}/ensprod&file={file_name}"
        f"&var_{parameter}=on&lev_all=on"
    )


def probe_parameter(date: str, cycle: int, product: str, forecast_hour: int, parameter: str) -> str:
    url = filter_url(date, cycle, product, forecast_hour, parameter)
    try:
        page = fetch_text(url)
    except HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            return "available"
        if exc.code == 404:
            return "not found"
        return f"HTTP {exc.code}"
    except Exception as exc:
        return f"ERROR {type(exc).__name__}: {exc}"

    text = unescape(re.sub(r"<[^>]+>", " ", page))
    compact = re.sub(r"\s+", " ", text)
    if "data file is not present" in compact.lower() or "does not exist" in compact.lower():
        return "missing file"
    if "over rate limit" in compact.lower():
        return "rate limited"
    if parameter in compact or "download" in compact.lower():
        return "available"
    return compact[:120]


def main() -> int:
    date, cycle = latest_cycle()
    forecast_hour = 1
    if len(sys.argv) >= 2:
        date = sys.argv[1]
    if len(sys.argv) >= 3:
        cycle = int(sys.argv[2])
    if len(sys.argv) >= 4:
        forecast_hour = int(sys.argv[3])

    print(f"Dataset page: {DATASET_URL}")
    try:
        page = fetch_text(DATASET_URL)
        print(f"Available dates: {', '.join(extract_available_dates(page)[:8]) or 'unknown'}")
    except Exception as exc:
        print(f"Dataset page error: {type(exc).__name__}: {exc}")

    print(f"Probe date={date} cycle={cycle:02d} f{forecast_hour:02d}")
    print("product, " + ", ".join(PARAMETERS))
    for product in PRODUCTS:
        statuses = [
            probe_parameter(date, cycle, product, forecast_hour, parameter)
            for parameter in PARAMETERS
        ]
        print(f"{product}, " + ", ".join(statuses))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
