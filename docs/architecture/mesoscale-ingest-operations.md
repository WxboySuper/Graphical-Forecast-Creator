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

## Feed health alerting

`.github/workflows/mesoscale-health.yml` runs `scripts/check-mesoscale-health.mjs` every hour (started by
the Cloudflare scheduler at minute 32, with a GitHub `47 * * * *` backup). It reads the catalog Worker's
`/status` and fails when any model is stale by the Worker's per-model limit, or its feed health is
`missing`, `invalid`, `failed`, or `unavailable`, or `/status` cannot be read. A failed run is the alert:
GitHub emails failed workflow runs to the repository owner (Settings, Notifications, Actions). A `partial`
feed is not an alert. The check needs the `MESOSCALE_WORKER_URL` repository variable and adds no thresholds
of its own, so changing a model's stale limit in the Worker changes the alert too.

## Cron trigger (Cloudflare Worker)

GitHub's `schedule` event is delayed or dropped under load, so the repository's primary cron is the
`gfc-mesoscale-scheduler` Worker (`cloudflare/mesoscale-scheduler.mjs`). It starts two workflows
through `workflow_dispatch`: the ingest (below) and the beta release (`release-beta.yml` at 03:23,
09:23, 15:23, and 21:23 UTC with `only_if_changed`, so it skips when `main` has no new commits since the
latest beta tag). Each cron expression needs an entry in the job table in the Worker and in
`wrangler.mesoscale-scheduler.jsonc`; a test keeps them in sync, and an unknown expression fails
loudly. The ingest cron runs at minutes 12
and 42 (off the start of the hour, when GitHub's queue is busy, and after HRRR's forecast hours for the previous cycle are normally on NOAA's bucket) and calls the GitHub `workflow_dispatch` API for `mesoscale-ingest.yml` on `main`. The
workflow's own `22,52` schedule stays as a backup; both are safe together because publishing is
idempotent and the workflow has a concurrency lock.

- Deploy: `release-beta.yml` deploys it with the catalog Worker (`wrangler.mesoscale-scheduler.jsonc`;
  account from `CLOUDFLARE_ACCOUNT_ID`).
- Secret: the repository secret `MESOSCALE_DISPATCH_TOKEN`, a fine-grained token limited to this
  repository with only **Actions: Read and write**. The release deploy pipes it to the Worker as the
  secret `GITHUB_DISPATCH_TOKEN` right after deploying (it never touches a file or the log). To set
  it by hand instead, run
  `pnpm dlx wrangler@4 secret put GITHUB_DISPATCH_TOKEN --config cloudflare/wrangler.mesoscale-scheduler.jsonc`
  after the first deploy has created the Worker. Rotate it before it expires (the current token
  expires 2027-11-09); update the repository secret and run a release to push the new value.
- Failure is visible: with a missing or rejected token the cron invocation fails in the Worker's
  Cloudflare logs, and `/status` goes `degraded` once a model cycle is stale.
- The Worker serves no requests (`workers_dev` off, no routes).

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
is about 122,400 Class A writes per month. The 2026-11-08 baseline run at zooms
3-4 counted 270 PNG tiles across each HRRR frame, or 15 tiles per field. The
2026-11-09 run at zooms 3-5 counted 846 tiles, or 47 per field. Packing them
into 18 field archives reduces archive PUTs from 846 to 18 per frame, about
47x, and yields 126 archive objects per seven-frame cycle. Packing remains
below the requested roughly 100x reduction. At seven ingest-side Class B operations per new cycle in
steady state (catalog checks, pointer check, verification listing, and
retention listings), the same schedule is about 15,120 Class B operations per
month. These estimates exclude Worker tile reads and retries while NOAA
publishes delayed frames. R2 delete operations for retention are free.

Live HRRR dry run, 2026-11-08: cycle `2026-11-08T18:00:00Z` completed all
seven frames and 18 fields per frame. It generated 126 archives totaling
29,384,874 bytes (about 28.0 MiB), from 132,803,194 downloaded bytes. It
rendered 1,890 PNG tiles and took 445.13 seconds (7m 25s). Dry-run mode made
no R2 writes.

## Zoom measurement and model limits

A Windows dry run used the pinned dependencies and NOAA HRRR cycle
`2026-11-09T16:00:00Z`, f00, with local temporary output and no R2 writes.
The renderer produced 47 tiles per field at zooms 3-5 and 147 at zooms 3-6.
The table reports bytes and render seconds per field. The z6 cumulative run
used about 2.0 GB peak working memory and took 323.84 seconds end to end for
f00. Scaling that f00 elapsed time across seven frames projects about 38
minutes, before frame-to-frame variation. That misses the under-20-minute
target and leaves little margin in the 45-minute job. Zoom 7 was not run
because z6 already misses the target.

| Field | z5 PNG bytes | z5 PMTiles bytes | z5 render s | z6 PNG bytes | z6 PMTiles bytes | z6 render s |
|---|---:|---:|---:|---:|---:|---:|
| temperature-2m | 1,002,692 | 1,003,057 | 6.846 | 2,685,774 | 2,686,426 | 18.461 |
| dewpoint-2m | 1,297,345 | 1,297,713 | 5.939 | 3,613,434 | 3,614,094 | 17.042 |
| cape-surface | 339,225 | 339,571 | 4.485 | 892,356 | 882,342 | 13.491 |
| cin-surface | 295,536 | 295,218 | 4.857 | 815,009 | 801,698 | 12.044 |
| cape-180-0mb-agl | 357,117 | 357,467 | 6.683 | 947,073 | 935,739 | 12.838 |
| cape-90-0mb-agl | 254,290 | 253,312 | 6.051 | 669,942 | 652,597 | 16.346 |
| cape-255-0mb-agl | 369,070 | 369,421 | 5.168 | 987,670 | 977,674 | 17.894 |
| cape-0-3000m-agl | 185,981 | 185,002 | 5.461 | 484,232 | 468,220 | 17.584 |
| cin-180-0mb-agl | 331,228 | 331,577 | 6.922 | 911,990 | 901,641 | 13.008 |
| cin-90-0mb-agl | 260,102 | 259,120 | 9.588 | 725,641 | 707,959 | 13.627 |
| cin-255-0mb-agl | 354,069 | 354,418 | 6.201 | 977,486 | 966,204 | 13.431 |
| srh-0-1km | 1,209,694 | 1,210,062 | 6.823 | 3,354,277 | 3,354,933 | 16.900 |
| srh-0-3km | 1,405,406 | 1,405,775 | 10.094 | 3,923,557 | 3,924,217 | 16.600 |
| surface-lcl | 1,563,320 | 1,563,689 | 9.168 | 4,452,931 | 4,453,592 | 17.534 |
| pwat | 892,660 | 893,015 | 6.460 | 2,342,992 | 2,343,637 | 19.075 |
| mslp | 450,782 | 451,116 | 6.082 | 1,085,502 | 1,086,081 | 17.391 |
| reflectivity | 167,839 | 166,125 | 4.601 | 449,956 | 423,965 | 13.289 |
| wind-speed-10m | 1,343,723 | 1,344,096 | 5.843 | 3,716,950 | 3,717,609 | 18.717 |
| **Total** | **12,080,079** | **12,079,754** | **117.272** | **33,036,772** | **32,898,628** | **285.272** |

We publish HRRR and RRFS through zoom 5 and keep RAP at zoom 4. HRRR and
RRFS have 3 km native grid spacing; RAP is 13 km. At CONUS latitudes, zoom 5
Web Mercator pixels are roughly 3.8 km on the ground, so zoom 5 stays at or
coarser than the 3 km model grids. Zoom 6 is roughly 1.9 km and adds pixels
finer than those grids. NOAA documents the [HRRR 3 km grid spacing](https://rapidrefresh.noaa.gov/hrrr/),
the [RAP 13 km grid spacing](https://www.ncei.noaa.gov/products/weather-climate-models/rapid-refresh-update),
and the [RRFS 3 km grid spacing](https://gsl.noaa.gov/rrfs/).

At z5, one HRRR f00 uses 12,079,754 archive bytes. Multiplying by seven
frames gives 84,558,278 bytes per HRRR cycle, or 507,349,668 bytes for six
retained cycles. Applying the measured HRRR f00 archive size as a conservative
upper estimate for each of RAP f00 and RRFS f00 gives 652,306,716 bytes across
six cycles of all three models, about 6.5% of R2's 10 GB free storage
allowance. RAP publishes only through z4, so its actual archives should be
smaller. This estimate excludes catalogs and health objects, which are small.

Scaling the measured z5 f00 end-to-end time across seven frames estimates
about 16.5 minutes for an HRRR cycle. This stays below the 20-minute target.
The z6 render time alone scales to about 33.3 minutes across seven frames,
before downloads and archive writing, so z6 does not meet the target. Zoom 7
is not a viable next step under this renderer and timeout.

The added zoom does not change object counts or R2 request counts. HRRR still
publishes 126 archives plus 3 other objects per cycle; RAP and RRFS retain 17
and 18 archives respectively. The current schedule remains about 122,400
Class A and 15,120 Class B operations per 30-day month. That is 12.2% of the
1 million Class A allowance and 0.15% of the 10 million Class B allowance.
R2 delete operations for retention are free.

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
