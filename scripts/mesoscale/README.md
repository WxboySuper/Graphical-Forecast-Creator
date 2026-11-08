# Mesoscale model ingest

This package discovers complete NOAA cycles, downloads allowlisted native fields, renders transparent XYZ tiles, and publishes a catalog and health report to local storage or Cloudflare R2. The hourly GitHub Actions workflow is `.github/workflows/mesoscale-ingest.yml`; its cron remains off until `MESOSCALE_INGEST_ENABLED=true` and the R2 secrets are configured.

## Local use

Install the pinned dependencies from `requirements.txt`, then run the package tests:

```sh
python -m pip install -r scripts/mesoscale/requirements.txt
python -m unittest discover -s scripts/mesoscale -p 'test_*.py'
```

Run a local dry run with `python scripts/mesoscale/ingest.py --model hrrr --dry-run`. The operations contract documents configuration, verification, retention, and live-run constraints in [mesoscale ingest operations](../../docs/architecture/mesoscale-ingest-operations.md). The published object names and catalog fields are defined in the [catalog contract](../../docs/architecture/mesoscale-catalog-contract.md).

RAP GRIB decoding needs ecCodes built with JPEG support. The GitHub Actions Ubuntu runner installs system ecCodes libraries before installing the Python package; some local binary wheels do not include JPEG support.
