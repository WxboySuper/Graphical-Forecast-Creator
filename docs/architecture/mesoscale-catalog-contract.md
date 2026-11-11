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
`[-130, 20, -60, 55]`. Zooms are model-specific: HRRR and RRFS publish 3
through 5, while RAP publishes 3 through 4. The Worker accepts archive zooms
from 0 through 24, then requires each archive header to match the range in its
catalog parameter. Clients place those limits on the OpenLayers XYZ source,
not the layer, so the last available level can scale up above its native zoom.
Archives and cycle catalogs are immutable once published. Archive writes use
R2's atomic `If-None-Match: *` create-only condition. If a retry finds an
existing archive, it reuses it only when its ETag matches the expected PNG
archive bytes; it never replaces the object.

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
    "maxZoom": 5
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
    "maxZoom": 5,
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
10 m wind-speed values may use explicit unit conversion. The GitHub Actions
ingest also derives `stp-fixed-surface` for HRRR and RRFS when all required
grids are available. Its parameter metadata identifies it as a derived index,
includes the formula, and lists the source fields. The read-only Worker and
client never calculate weather diagnostics. Wind speed is `sqrt(U10^2 + V10^2)`
in m/s, a display conversion of two native components. CAPE and CIN keep the
exact NCEP level string in `level.label`; do not relabel them MU, ML, or
surface-based unless the inventory verifies that identity.

The fixed-layer STP formula is `(SBCAPE / 1500) * fLCL * (SRH01 / 150) *
fBWD6 * fCIN`. `fLCL = clamp((2000 - SBLCL) / 1000, 0, 1)`. `fBWD6` is zero
below 12.5 m/s and otherwise `clamp(BWD6, 0, 30) / 20`, where
`BWD6 = sqrt(VUCSH^2 + VVCSH^2)` from the 0-6000 m above-ground records. No depth
multiplier is applied. If surface CIN is present, `fCIN = clamp((200 + SBCIN) /
150, 0, 1)`; if the optional CIN input is absent, that factor is 1. The inputs
are `CAPE:surface`, `HGT:level of adiabatic condensation from sfc`,
`HLCY:1000-0 m above ground`, `VUCSH:0-6000 m above ground`,
`VVCSH:0-6000 m above ground`, and optional `CIN:surface`. The display name
states fixed layer, units are `1`, and legend stops are 0, 0.5, 1, 2, 4, and 8.
The label at 1 calls it a conventional reference, not a probability.

NCEP's RRFS f000 index reports `VUCSH` and `VVCSH` units as `s**-1`. On the
2026-11-09 18Z file, I downloaded only the two indexed 0-6000 m messages:
VUCSH bytes 146107515-147171716 (1,064,202 bytes) and VVCSH bytes
147171717-148213614 (1,041,898 bytes). ecCodes decoded them as
`heightAboveGroundLayer`, top 0 m and bottom 6000 m. VUCSH values ranged from
-21.3 to 41.9 (mean 10.710); VVCSH ranged from -37.2 to 33.1 (mean -0.136).
Those values are consistent with wind components in m/s, despite the reported
unit string. The ingest uses the components as m/s without multiplying by
layer depth. RAP is skipped because its index lacks surface LCL. Effective-
layer STP and SCP are not built: the required parcel, effective SRH, and
effective shear inputs are unavailable.

`status` is `complete`, `partial`, or `failed` at cycle, frame, and parameter
level. A partial cycle is diagnostic only and cannot be the model's latest
pointer. A missing/unmatched native field is omitted from `parameters` and
listed in `unavailableParameters` with an exact reason. Do not substitute a
field from another level, model, or cycle. `source` uses the NOAA dataset URL
and attribution above, with the dataset ID matching its actual source bucket.

The domain range and every parameter's range must agree with each PMTiles
header. The Worker reads at most 16,257 bytes for the root directory, so the
writer must keep that directory within the PMTiles v3 root limit. Leaf and
other directories use the separate 2 MiB range cap.

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
fields can be unavailable without failing the frame. Fixed-layer STP is
optional: if any required input is missing or grids do not align, the derived
parameter is omitted and listed in `unavailableParameters`. The raw 0-6000 m
shear components are ingest-only and do not become separate catalog
parameters.

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
