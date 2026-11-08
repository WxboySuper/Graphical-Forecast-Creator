# Mesoscale ingest catalog contract

Issue: [#1759](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1759)

This document is the wire contract between the GitHub Actions publisher and the
separate read-only catalog Worker tracked by #1760. The publisher writes static
JSON and PNG objects to Cloudflare R2. The Worker must not infer meteorology or
rewrite model identities.

## R2 keys and publication order

Use a bucket prefix `mesoscale/v1`. Object keys are immutable except for a
model's latest pointer:

```
mesoscale/v1/catalog/{model}/{cycle}.json
mesoscale/v1/archives/{model}/{cycle}/f{forecastHour:02d}/{parameter}.pmtiles
mesoscale/v1/latest/{model}.json
mesoscale/v1/health/{YYYY-MM-DD}/{model}.json
```

`model` is `hrrr`, `rap`, or `rrfs`; `cycle` is UTC `YYYYMMDDTHH00Z` and
`forecastHour` is a zero-padded integer. Each field in each published frame is
one PMTiles v3 archive. The public tile template in the catalog does not expose
the archive and remains
`/api/mesoscale/tiles/{model}/{cycle}/f{hh}/{parameter}/{z}/{x}/{y}.png`, with
literal `{z}`, `{x}`, and `{y}` placeholders. The Worker parses those route
parts, finds the matching frame and parameter in the cycle catalog, verifies
that the parameter's `data.archiveKey` matches the deterministic archive key
above, converts XYZ `z/x/y` to the PMTiles tile id, then reads that tile from
the archive. The Worker range-read implementation is tracked separately in
#1776. Clients continue to request ordinary XYZ PNGs.

Archives contain PNG bytes unchanged. The PMTiles header uses `tile_type: png`
and `tile_compression: none`; do not gzip or otherwise recompress PNG tile
payloads. PMTiles directory/metadata compression is independent of tile
compression. Header `min_zoom` and `max_zoom` are the inclusive published zoom
limits, and header `min_lon_e7`, `min_lat_e7`, `max_lon_e7`, and `max_lat_e7`
match the catalog domain bounds. For the current CONUS domain these are
`[-130, 20, -60, 55]` and zooms 3 through 4. Clients must not request outside
that domain or zoom interval. Archives and cycle catalogs are immutable once
published. Archive writes use R2's atomic `If-None-Match: *` create-only
condition. If a retry finds an existing archive, it reuses it only when its
ETag matches the expected PNG archive bytes; it never replaces the object.

Write all archives first, then make one batched size and ETag/MD5 verification
of every referenced archive. Each parameter also records the local archive's
SHA-256 in `data.archiveSha256`. Write the immutable cycle catalog only after
that succeeds. Validate the catalog and finally write the latest pointer. The
latest pointer is always the last publication write. A failed or partial cycle
may appear in the health report but must never become latest. Never overwrite
an already complete cycle; a retry can safely skip its existing objects.
Retention removes old catalogs and their archives only after a newer complete
pointer is live, and keeps six complete cycles per model by default.

HRRR cycles require complete f00 through f06 frames. RAP and RRFS require f00
only. f00 is `analysis`; f01 and later are `forecast`. If a requested HRRR
forecast hour is not yet available, record the cycle as `partial` in health
and do not write its archives or catalog. The hourly run retries that same
cycle. This avoids freezing a partial catalog at the immutable
`catalog/{model}/{cycle}.json` key. A cycle with a decoded but unavailable
required field follows the existing failed/partial field rules and never
becomes latest.

## Cycle catalog JSON

The top-level object is schema version 1:

```json
{
  "schemaVersion": 1,
  "model": { "id": "hrrr", "name": "High-Resolution Rapid Refresh" },
  "cycleTime": "2026-11-08T12:00:00Z",
  "status": "complete",
  "receivedAt": "2026-11-08T12:51:24Z",
  "processedAt": "2026-11-08T13:04:11Z",
  "ageMinutes": 64,
  "processingVersion": "gfc-mesoscale-ingest/1.0.0",
  "domain": {
    "id": "conus",
    "name": "CONUS",
    "projection": "EPSG:3857",
    "bounds": [-130, 20, -60, 55],
    "minZoom": 3,
    "maxZoom": 6
  },
  "frames": [
    {
      "forecastHour": 0,
      "validTime": "2026-11-08T12:00:00Z",
      "frameType": "analysis",
      "status": "complete",
      "parameters": []
    }
  ]
}
```

All timestamps are RFC 3339 UTC strings ending in `Z`. `ageMinutes` is the
non-negative floor of `(publishedAt - cycleTime) / 60 seconds`, calculated
when the catalog is written. Consumers should calculate display age again from
`cycleTime` or `validTime` at read time. An f00 frame is `analysis`; it remains
a model initialization/analysis and must never be called observed. f01 and
later frames are `forecast`.

Each frame's `parameters` array contains the fields that actually decoded and
rendered. Its parameter object is deliberately compatible with
`MesoscaleProviderParameter`. The `data` property is a tile descriptor and can
be passed to `normalizeProviderPayload` unchanged:

```json
{
  "id": "temperature-2m",
  "displayName": "2 m temperature",
  "units": "°C",
  "level": { "type": "height", "label": "2 m above ground", "value": 2, "units": "m" },
  "legend": [
    { "value": -20, "label": "-20", "color": "#542788" },
    { "value": 0, "label": "0", "color": "#2c7fb8" },
    { "value": 20, "label": "20", "color": "#fdae61" }
  ],
  "displayType": "raster",
  "data": {
    "type": "xyz-raster",
    "urlTemplate": "https://gfc.weatherboysuper.com/api/mesoscale/tiles/hrrr/20261108T1200Z/f00/temperature-2m/{z}/{x}/{y}.png",
    "archiveKey": "mesoscale/v1/archives/hrrr/20261108T1200Z/f00/temperature-2m.pmtiles",
    "tileCompression": "none",
    "format": "image/png",
    "projection": "EPSG:3857",
    "minZoom": 3,
    "maxZoom": 6,
    "bounds": [-130, 20, -60, 55]
  },
  "source": {
    "providerId": "noaa-open-data",
    "providerName": "NOAA Open Data on AWS",
    "datasetId": "noaa-hrrr-bdp-pds",
    "attribution": "NOAA/NCEP High-Resolution Rapid Refresh (HRRR)",
    "url": "https://registry.opendata.aws/noaa-hrrr-pds/"
  },
  "receivedAt": "2026-11-08T12:51:24Z",
  "processedAt": "2026-11-08T13:04:11Z",
  "ageMinutes": 64,
  "processingVersion": "gfc-mesoscale-ingest/1.0.0",
  "status": "complete"
}
```

`level.type` uses the existing client enum: `surface`, `pressure`, `height`,
`depth`, `layer`, or `model`. `legend` stops are numeric native/display values
with human labels and CSS hex colors. Colors style values only. T2m, Td2m and
10 m wind-speed values may use explicit unit conversion; no derived
meteorological diagnostic is permitted. Wind speed is `sqrt(U10² + V10²)` in
m/s, a display arithmetic conversion of the two native components. CAPE and
CIN keep the exact NCEP level string in `level.label`; do not label them MU, ML,
or surface-based unless the inventory explicitly verifies that identity. The
`VUCSH`/`VVCSH` 0-6 km records are omitted because NCEP reports their units as
`s**-1` and the inventory does not establish an exact conversion to standard
bulk wind difference in `m s**-1`.

`status` is `complete`, `partial`, or `failed` at cycle, frame, and parameter
level. A partial cycle is diagnostic only and cannot be the model's latest
pointer. A missing/unmatched native field is omitted from `parameters` and
listed in `unavailableParameters` with an exact reason. Do not substitute a
field from another level, model, or cycle. `source` uses the NOAA dataset URL
and attribution above, with the dataset ID matching its actual source bucket.

The remaining cycle catalog fields are:

```json
{
  "requestedParameterIds": ["temperature-2m"],
  "unavailableParameters": [{ "id": "temperature-2m", "reason": "..." }],
  "source": {
    "providerId": "noaa-open-data",
    "providerName": "NOAA Open Data on AWS",
    "datasetId": "noaa-hrrr-bdp-pds",
    "attribution": "NOAA/NCEP High-Resolution Rapid Refresh (HRRR)",
    "url": "https://registry.opendata.aws/noaa-hrrr-pds/"
  }
}
```

The producer writes `status: complete` only if every configured required field
for that model/frame was fetched, decoded, tiled and checksum-verified. Optional
fields can be unavailable without failing the frame. v1.8 publishes native
fields only; SCP and STP are out of scope.

## Latest pointer

The pointer is small and changes only after a complete cycle catalog is live:

```json
{
  "schemaVersion": 1,
  "modelId": "hrrr",
  "cycleTime": "2026-11-08T12:00:00Z",
  "catalogUrl": "https://gfc.weatherboysuper.com/api/mesoscale/catalog/hrrr/20261108T1200Z.json",
  "publishedAt": "2026-11-08T13:04:11Z"
}
```

`cycleTime` must equal the catalog cycle. Resolve latest by complete cycle time,
not by download arrival or a desired/current clock hour. A delayed older cycle
never replaces a newer complete pointer.

## Feed health

Daily per-model health JSON has `schemaVersion`, `generatedAt`, and `modelId`.
It records `expectedCycleTime`, `latestAvailableCycleTime`,
`status` (`complete`, `partial`, or `failed`), `receivedAt`, `processedAt`,
`ageMinutes`, `framesComplete`, `framesFailed`, `tilesWritten`,
`bytesDownloaded`, `bytesPublished`, and `error` when applicable. This summary
is operational telemetry, not an input to catalog resolution.
