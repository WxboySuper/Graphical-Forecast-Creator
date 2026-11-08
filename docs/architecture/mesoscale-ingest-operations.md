# Mesoscale ingest operations

Issue: [#1759](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1759)

The hourly workflow `.github/workflows/mesoscale-ingest.yml` is disabled until
repository variable `MESOSCALE_INGEST_ENABLED` is the literal string `true`.
Workflow dispatch can run a manual job. Use a public GitHub Actions runner.
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

The job uses NOAA's public AWS buckets as its source. It publishes immutable
cycle tile and catalog keys, moves the model latest pointer only after a
complete cycle validates, then deletes cycles older than the six-cycle default.
Partial runs are recorded in daily feed health and do not replace latest.

## Upload verification and failure handling

Each tile's MD5 is computed before upload and compared with the single-part S3
ETag when the backend returns one. Before catalog creation, the publisher makes
a bounded-retry, batched object listing for the cycle's tile prefix and checks
that every referenced key exists with its expected byte size. It does not read
tile bodies back from R2. Only after this verification and catalog validation
does it write the immutable cycle catalog and then replace the latest pointer.
An upload or verification failure therefore leaves latest unchanged. A failed
pipeline stage writes a `failed` health report with the exception class and
message; the report write does not modify latest. A complete cycle already in
the store is checked immediately after discovery so a rerun skips GRIB ranges,
decoding, and rendering, while still retrying a missing/stale latest pointer.
Retention runs after the latest pointer flips. A cleanup error is reported as a
warning and does not turn a successfully published cycle into a failed health
report; the next successful run retries cleanup.

Install the pinned Python dependencies from `scripts/mesoscale/requirements.txt`.
Run parser and publisher tests with:

```sh
python -m unittest discover -s scripts/mesoscale -p 'test_*.py'
```

Run a live no-R2 f00 check with:

```sh
python scripts/mesoscale/ingest.py --model hrrr --dry-run
```

The local output directory contains temporary per-field XYZ tiles. Zoom levels
3 and 4 cap each global pyramid at 340 possible tiles per field (64 at z3,
256 at z4); only non-empty tiles are stored. Check reported bytes before
enabling the schedule. The worker URL and catalog schema are specified in
[`mesoscale-catalog-contract.md`](mesoscale-catalog-contract.md).
