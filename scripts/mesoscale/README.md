# Mesoscale model ingest

This package discovers NOAA cycles, downloads allowlisted native fields, renders transparent XYZ PNG tiles, packs one PMTiles v3 archive per field and frame, and publishes a catalog and health report to local storage or Cloudflare R2. HRRR publishes f00-f06; RAP and RRFS publish f00. The hourly GitHub Actions workflow is `.github/workflows/mesoscale-ingest.yml`; its cron remains off until `MESOSCALE_INGEST_ENABLED=true` and the R2 secrets are configured.

## Local use

Install the pinned dependencies from `requirements.txt`, then run the package tests:

```sh
python -m pip install -r scripts/mesoscale/requirements.txt
python -m unittest discover -s scripts/mesoscale -p 'test_*.py'
```

PMTiles archives use the upstream Protomaps Python writer pinned as
`pmtiles==3.8.1`. It is the project's reference implementation, distributed
under BSD-3-Clause, with no transitive runtime dependencies. The pinned wheel
is 17 KB. The writer stores PNG tile bytes without recompressing them; PMTiles
directory compression remains internal to the archive format. Socket's public
package page did not return a report during implementation, so the PR's Socket
check is the final supply-chain review for this dependency.

Run a local dry run with `python scripts/mesoscale/ingest.py --model hrrr --dry-run`. It discovers f00-f06, reports partial health without downloading GRIB ranges if a forecast hour is not ready, and writes local PMTiles archives when all seven frames are available. The operations contract documents configuration, verification, retention, and the R2 operation estimate in [mesoscale ingest operations](../../docs/architecture/mesoscale-ingest-operations.md). The published object names and catalog fields are defined in the [catalog contract](../../docs/architecture/mesoscale-catalog-contract.md).

RAP GRIB decoding needs ecCodes built with JPEG support. The GitHub Actions Ubuntu runner installs system ecCodes libraries before installing the Python package; some local binary wheels do not include JPEG support.
