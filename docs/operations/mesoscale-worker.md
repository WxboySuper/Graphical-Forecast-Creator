# Mesoscale catalog Worker operations

The read-only `gfc-mesoscale` Worker serves catalog JSON and PNG tile objects
from R2. The publisher and object formats are described in the
[mesoscale ingest operations](https://github.com/WxboySuper/Graphical-Forecast-Creator/blob/main/docs/architecture/mesoscale-ingest-operations.md)
and [catalog contract](https://github.com/WxboySuper/Graphical-Forecast-Creator/blob/main/docs/architecture/mesoscale-catalog-contract.md).
Keep this Worker aligned with that contract. The Worker does not download,
inspect, decode, or calculate weather data.

## Deploy

The `Release | Beta` workflow (`release-beta.yml`) deploys `gfc-mesoscale` after
every beta cut. It runs when an owner dispatches it and on a six-hourly schedule that
skips itself unless `main` has new commits since the latest beta tag. The Worker
is separate from the beta site Worker (`deploy-beta-workers.yml`).

To enable the job:

1. Create the dedicated R2 bucket used by the ingest publisher and add its name
   as the `R2_BUCKET` secret. `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`
   are the same secrets the beta site deploy uses; the token needs permission to
   deploy Workers and bind R2. It must not be the ingest writer credential.
2. Set the `MESOSCALE_WORKER_URL` repository variable to the Worker's public
   https origin, without a path (for example the `workers.dev` URL or a custom
   domain). While it is empty the job is skipped. The workflow also passes it to
   the beta build as `VITE_MESOSCALE_WORKER_URL_BETA`.

`scripts/render-mesoscale-wrangler.mjs` fills the account, bucket, and
`PUBLIC_BASE_URL` placeholders (and, for a custom domain such as
`mesoscale.gfcweather.com`, adds the matching `custom_domain` route so every
deploy keeps the domain attached) in `cloudflare/wrangler.mesoscale.jsonc` at deploy
time, runs the Worker tests, deploys, and checks `GET /status`. Edit the other
`vars` in the checked-in file:

- `CORS_ALLOWED_ORIGINS`: a comma-separated exact origin list. The default covers
  production (`https://gfc.weatherboysuper.com`), staging
  (`https://staging-gfc.weatherboysuper.com`), beta
  (`https://beta.gfcweather.com`), and local Vite development
  (`http://localhost:3000` and `http://localhost:3002`).
- `STALE_AFTER_MINUTES`: the fallback age limit; it defaults to 180 minutes.
- `STALE_AFTER_MINUTES_BY_MODEL`: a JSON object of model-specific age limits in
  minutes. The current defaults are `hrrr: 180`, `rap: 180`, and `rrfs: 540`.
  Values must be whole numbers from 0 through 10,080. Missing or invalid model
  values use `STALE_AFTER_MINUTES`; malformed JSON, arrays, and non-object JSON
  disable model overrides and use that fallback for every model.

To deploy by hand, run the render script with `CLOUDFLARE_ACCOUNT_ID`,
`MESOSCALE_R2_BUCKET`, and `MESOSCALE_PUBLIC_BASE_URL` set, then
`pnpm dlx wrangler@4 deploy --config cloudflare/wrangler.mesoscale.rendered.json`.
Runtime access is read-only through the R2 binding.

## App URL configuration

Set the app's catalog base to `PUBLIC_BASE_URL` using the build-target
environment variables `VITE_MESOSCALE_WORKER_URL_LOCAL`,
`VITE_MESOSCALE_WORKER_URL_BETA`, `VITE_MESOSCALE_WORKER_URL_STAGING`, and
`VITE_MESOSCALE_WORKER_URL_PRODUCTION`. `VITE_MESOSCALE_WORKER_URL` can supply
one common fallback. Then use `{base}/catalog/{model}/{cycle}.json` and
`{base}/latest/{model}.json`. The Worker rewrites valid `xyz-raster`
`urlTemplate` values in catalogs to that base and returns a matching
`catalogUrl` from latest pointers. The app should use the catalog's
`data.urlTemplate` directly. It must not build R2 URLs.
Catalog templates must use the exact v1 public Worker PNG path
`/tiles/{model}/{cycle}/f{hh}/{parameter}/{z}/{x}/{y}.png`, without a query
or fragment. The Worker validates that shape before rewriting the host so
catalogs cannot direct clients to a different object or route.
The Worker Cache API stores immutable catalogs and tiles, plus five-second
responses for latest/status. It recalculates age and stale fields from the cycle
timestamp on every dynamic cache hit; status cache keys also include the stale
threshold. When rotating `PUBLIC_BASE_URL`, clear any external CDN or client
caches because catalogs use long immutable HTTP caching.

`GET /status` returns `status` (`healthy` or `degraded`) and one entry per
model with `latestCycleTime`, recomputed `ageMinutes`, `stale`, `health`, and
`healthGeneratedAt`. Health values include the publisher's `complete`,
`partial`, and `failed` states plus `missing` or `invalid` for absent or broken
records. A broken current-day health record remains `invalid` rather than being
masked by yesterday's summary. A failed R2 read is reported as `unavailable`,
separate from a missing object or an invalid record. The response shape stays
the same when thresholds differ by model. `/latest/{model}.json` and catalog
responses expose the matching live age and stale state in
`X-Mesoscale-Age-Minutes` and `X-Mesoscale-Stale`; the catalog JSON shape does
not change. The app trusts these Worker values and does not choose a second
stale threshold.

## Cache and usage budget

Catalog and pointer requests read one R2 object on a Worker Cache API miss.
Tile requests resolve their catalog frame and parameter, verify the catalog's
`archiveKey` against the fixed archive key layout, then use PMTiles v3 byte
ranges. A cold tile lookup reads the catalog once per Worker isolate and the
archive header, root directory, and tile bytes. A tile routed through a leaf
directory adds one leaf range. The Worker keeps up to eight immutable catalog
records and eight archive headers in bounded isolate memory. It keeps at most
four parsed directories for each cached archive. After those entries are warm,
a tile `GET` costs one R2 range read for the PNG bytes. `HEAD` validates the
cached archive identity with a one-byte range at the tile offset, without
fetching the full payload. A first missing-tile lookup probes one byte from the
root directory to validate its cached identity; out-of-zoom requests need no
archive range. Each R2 range `get` counts as one
Class B operation regardless of its byte length. Catalog `HEAD` reads and
validates the catalog like `GET`; latest `HEAD` reads its small pointer to
compute live age headers. Each `/latest` request reads one pointer.
The in-memory entries are keyed by immutable catalog/archive keys; publication
uses create-only writes and never replaces a cycle catalog or archive. LRU
eviction bounds isolate memory, and a new cycle uses new keys. This cache
assumption depends on the immutability rule in the catalog contract.
The compressed root directory is capped at 16,257 bytes by PMTiles v3, leaf
directory reads and decompressed directories are capped at 2 MiB, and an
individual tile range is capped at 8 MiB before Worker memory is allocated.
Oversized or malformed archive entries return the same safe 502 response as
other invalid archive data.
Each `/status` request reads up to nine objects: three latest
pointers and today's and yesterday's health object for each of the three models.
The Worker Cache API stores immutable catalogs, tiles, and short-lived missing
tiles. Latest/status cache entries last five seconds; their age and stale fields
are recomputed from cached cycle timestamps on each hit. HTTP cache headers give
catalogs and tiles one year, latest/status five seconds, and missing tiles 60
seconds. R2 cache misses count as Class B operations.

For 100,000 tile requests, 1,000 catalog requests, 10,000 latest requests,
and 1,000 status requests per month, an all-warm tile workload uses about
100,000 tile `GET` range reads (plus one range per tile `HEAD`), up to 9,000
status reads, and the pointer/catalog misses. An all-cold tile workload can use roughly 300,000 to 400,000 range
reads, depending on how many tiles use leaf directories. With a 90% Worker
Cache API hit rate, the tile range count falls to about 10,000 to 50,000,
depending on whether the remaining Worker isolates have warm directory state.
The $5 Workers Paid plan includes 10 million Worker requests and 30 million
CPU milliseconds per month. Budget about 1 ms CPU for a warm tile request and
up to 3 ms for a cold request as planning estimates, not measured Cloudflare
analytics. At those rates the CPU allowance covers 30 million warm or 10
million cold requests. R2's free allocation includes 10 million Class B reads,
so 10 million warm uncached tiles use that full allowance; cold archive and
directory ranges can reach it sooner. A status-heavy workload can use up to
nine Class B reads per Worker request; about 1.1 million status requests would
reach 10 million reads. Check Cloudflare CPU and R2 analytics after rollout,
then replace these planning estimates with observed per-route values.

The existing $5 Workers Paid plan includes 10 million requests and 30 million
CPU milliseconds per month. The R2 free allocation includes 10 million Class B
operations per month. Additional usage is billed beyond those included
amounts. This Worker does small route checks and JSON serialization; it never
does GRIB work. At 10 million requests and an average of 1 ms CPU per request,
it uses about 10 million CPU milliseconds. At 3 ms it uses 30 million. Watch
Cloudflare analytics for request volume, CPU time, cache status, and R2
operations before raising load expectations. Confirm current plan pricing and
included usage in the [Cloudflare Workers and R2 pricing page](https://developers.cloudflare.com/workers/platform/pricing/).

If public tile traffic grows enough that Worker request or CPU usage is the
cost driver, evaluate an R2 custom domain for tile delivery. A public R2 custom
domain can serve the immutable tile keys through Cloudflare's cache without
spending a Worker invocation per tile. Keep the Worker for catalogs, pointers,
and status. Do not expose the bucket's write credentials or change the
publisher's publication order.

## Abuse and failure behavior

Routes accept only the three contract models and construct keys under
`mesoscale/v1`. They reject encoded separators, traversal strings, malformed
cycles, invalid forecast hours, parameter IDs outside the lowercase slug
pattern, and XYZ coordinates outside the zoom 0 to 24 numeric range. The
catalog publishes a narrower usable zoom interval; clients should honor those
catalog `minZoom` and `maxZoom` values. Missing tiles return a cacheable 404.
OpenLayers 10.11.0's `ImageTile` error handler marks failed image loads as errors
and substitutes its blank image, so this Worker does not need to download or
store transparent PNG bodies for absent tiles.
Catalog, pointer, and health JSON objects larger than 4 MiB are rejected before
parsing so a corrupt object cannot consume unbounded Worker memory.

CORS is an origin allowlist, not authentication. Public endpoints can still be
called outside a browser, so monitor request spikes and use Cloudflare rate
limiting or a custom-domain cache policy if scraping or abuse becomes a cost
problem. Keep `STALE_AFTER_MINUTES` aligned with the feed cadence. `/status`
reports the latest pointer's age and health-object status; `/latest/{model}.json`
reports recomputed age and `X-Mesoscale-Stale`. Neither endpoint promotes an
older cycle when the feed is delayed.

For local offline development, set `VITE_MESOSCALE_FIXTURES=true` with the local
build target. The client then reads the checked-in provider fixtures and uses
the transparent 8 by 8 `/mesoscale-fixtures-tile.png` placeholder for raster tiles. Fixture mode is ignored for
beta, staging, and production builds.
