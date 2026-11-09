# Mesoscale ingest operations

Issue: [#1759](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1759)

The workflow `.github/workflows/mesoscale-ingest.yml` is scheduled at minutes 22
and 52 of every hour (off the start of the hour, when GitHub delays or drops
queued scheduled runs, and twice so a dropped run does not skip a cycle). A run
that finds the newest cycle already published exits in seconds. The schedule is
disabled until repository variable `MESOSCALE_INGEST_ENABLED` is the literal
string `true`. GitHub can still delay scheduled runs; see issue #1808 for the
external trigger that makes timing reliable. Workflow dispatch can run a manual job. Use a public GitHub Actions runner.
The workflow has a concurrency lock and a 45 minute timeout, with per-model
retry limits in the Python client. It caches the ecCodes definitions directory;
the GRIB fields and output objects are never cached between cycles.

Before enabling publication, configure these repository secrets:

| Secret | Value |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account identifier used in the R2 endpoint |
| `R2_BUCKET` | Dedicated bucket for the catalog contract |
| `R2_ACCESS_KEY_ID` | R2 API token access key with object read/write/delete access |
| `R2_SECRET_ACCESS_KEY` | Matching R2 API token secret |

The job uses NOAA's public AWS buckets as its source. It publishes one
immutable PMTiles archive per field and frame, then an immutable cycle catalog.
It moves the model latest pointer only after a complete cycle validates, then
deletes cycles older than the six-cycle default. Partial runs are recorded in
daily feed health and do not replace latest.

## Upload verification and failure handling

Each archive's MD5 is compared with the single-part S3 ETag returned by R2.
Before catalog creation, the publisher makes one bounded-retry listing for the
cycle's archive prefix and checks every referenced archive's size and ETag.
The catalog also records each archive's SHA-256. This verifies the upload
without reading archive bodies back from R2. Only after this batch succeeds and
the catalog validates does the publisher write the immutable cycle catalog,
then replace the latest pointer. An upload or verification failure leaves
latest unchanged. A failed pipeline stage writes a `failed` health report with
the exception class and message; that report does not modify latest.

HRRR requires f00 through f06. If one of those forecast objects or indexes has
not appeared yet, discovery records the missing hours as a `partial` health
result and skips all range downloads and R2 archive writes. The next hourly
run checks the newest f00 and older candidates until it finds a cycle with all
seven frames. RAP and RRFS continue to publish f00 only. A complete cycle
already in the store is checked before frame range downloads, so reruns skip
decode and render while still repairing a missing or stale latest pointer.
Retention runs after latest changes. Cleanup errors are warnings and do not
turn a successful publish into failed health; the next successful run retries.

## R2 operation and storage estimate

The current field inventory has 18 HRRR fields, 17 RAP fields (RAP omits
surface LCL), and 18 RRFS fields. One complete cycle writes one archive per
field/frame plus catalog, latest pointer, and health objects:

| Model | Archives | Other writes | Class A writes per cycle |
|---|---:|---:|---:|
| HRRR f00-f06 | 126 | 3 | 129 |
| RAP f00 | 17 | 3 | 20 |
| RRFS f00 | 18 | 3 | 21 |

At 24 completed hourly cycles per day for each model and a 30-day month, that
is about 122,400 Class A writes per month. The live run below counted 270 PNG
tiles across each HRRR frame, or 15 tiles per field on average. Packing those
tiles into 18 field archives reduces archive PUTs from 270 to 18 per frame
(15x for this measured zoom/domain), and yields 126 archive objects per
seven-frame cycle. The requested roughly 100x reduction is not present in this
live tile distribution; the per-field archive boundary and current zoom range
produce about 15x. At seven ingest-side Class B operations per new cycle in
steady state (catalog checks, pointer check, verification listing, and
retention listings), the same schedule is about 15,120 Class B operations per
month. These estimates exclude Worker tile reads and retries while NOAA
publishes delayed frames. R2 delete operations for retention are free.

Live HRRR dry run, 2026-11-08: cycle `2026-11-08T18:00:00Z` completed all
seven frames and 18 fields per frame. It generated 126 archives totaling
29,384,874 bytes (about 28.0 MiB), from 132,803,194 downloaded bytes. It
rendered 1,890 PNG tiles and took 445.13 seconds (7m 25s). Dry-run mode made
no R2 writes. The corresponding complete publish is estimated at 129 Class A
writes per cycle: 126 archive objects and 3 catalog, latest, and health
objects. Across HRRR f00-f06, RAP f00, and RRFS f00 on the hourly schedule,
the estimates are 122,400 Class A and 15,120 Class B operations per 30-day
month.

Recheck actual `archives`, `bytesPublished`, frame count, and elapsed runtime
when NOAA source coverage, requested fields, or zoom levels change. Dry runs
download and render NOAA data but make no R2 writes.

Install the pinned Python dependencies from `scripts/mesoscale/requirements.txt`.
Run parser and publisher tests with:

```sh
python -m unittest discover -s scripts/mesoscale -p 'test_*.py'
```

Run a live no-R2 HRRR f00-f06 check with:

```sh
python scripts/mesoscale/ingest.py --model hrrr --dry-run
```

The local output directory contains per-field PMTiles archives. Zoom levels 3
and 4 cap each global pyramid at 340 possible tiles per field (64 at z3, 256
at z4); only non-empty PNG tiles are stored. PMTiles uses its directory format
to pack these tiles into one object per field/frame. Check reported bytes and
runtime before enabling the schedule. The worker URL and catalog schema are specified in
[`mesoscale-catalog-contract.md`](mesoscale-catalog-contract.md).
