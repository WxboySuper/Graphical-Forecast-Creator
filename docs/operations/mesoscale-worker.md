# Mesoscale catalog Worker operations

The read-only `gfc-mesoscale` Worker serves catalog JSON and PNG tile objects
from R2. The publisher and object formats are described in the
[mesoscale ingest operations](https://github.com/WxboySuper/Graphical-Forecast-Creator/blob/main/docs/architecture/mesoscale-ingest-operations.md)
and [catalog contract](https://github.com/WxboySuper/Graphical-Forecast-Creator/blob/main/docs/architecture/mesoscale-catalog-contract.md).
Keep this Worker aligned with that contract. The Worker does not download,
inspect, decode, or calculate weather data.

## Deploy

The beta asset deployment workflow targets a different Worker. No automated
deployment is configured for `gfc-mesoscale`; deploy it manually after filling
the placeholders in `cloudflare/wrangler.mesoscale.jsonc`:

1. Create or select the dedicated R2 bucket used by the ingest publisher.
2. Replace the account, bucket, and preview bucket placeholders. Add the
   production Worker route or custom domain in the
   Cloudflare dashboard after the hostname is ready.
3. Set `PUBLIC_BASE_URL` to that public HTTPS origin, without a path. The Worker
   uses it when building catalog tile templates and latest catalog links.
4. Set `CORS_ALLOWED_ORIGINS` to a comma-separated exact origin list. The
   default covers production (`https://gfc.weatherboysuper.com`), staging
   (`https://staging-gfc.weatherboysuper.com`), beta
   (`https://beta.gfcweather.com`), and local Vite development
   (`http://localhost:3000` and `http://localhost:3002`). Add another local
   port only when needed.
5. Set `STALE_AFTER_MINUTES` to the operational age limit. It defaults to 180.
6. Deploy with `pnpm dlx wrangler@4 deploy --config cloudflare/wrangler.mesoscale.jsonc`.

Use a Wrangler API token with permission to deploy Workers and bind the target
R2 bucket. Do not use the ingest writer credentials in this Worker. Runtime
access is read-only through the R2 binding.

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
separate from a missing object or an invalid record.

## Cache and usage budget

The Worker reads at most one R2 object for a catalog, latest pointer, or tile
request. Tile `HEAD` uses R2 object metadata. Catalog `HEAD` reads and validates
the catalog just like `GET`, while latest `HEAD` reads its small pointer to
compute live age headers. Each R2 read counts as a Class B operation. Each
`/latest` request reads one pointer.
Each `/status` request reads up to nine objects: three latest
pointers and today's and yesterday's health object for each of the three models.
The Worker Cache API stores immutable catalogs, tiles, and short-lived missing
tiles. Latest/status cache entries last five seconds; their age and stale fields
are recomputed from cached cycle timestamps on each hit. HTTP cache headers give
catalogs and tiles one year, latest/status five seconds, and missing tiles 60
seconds. R2 cache misses count as Class B operations.

For an example load of 100,000 tile requests, 1,000 catalog requests, 10,000
latest requests, and 1,000 status requests per month, an entirely cold cache
would require about 120,000 R2 reads (status accounts for at most 9,000). With
a 90% Cache API hit rate across routes, the estimate is about 12,000 reads.
Ten million cold tile misses alone use
the full 10 million included R2 Class B reads. A status-heavy workload can use
up to nine Class B reads per Worker request; about 1.1 million status requests
would reach the 10 million included reads. Estimate traffic mix and cache rates
before broad rollout.

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
