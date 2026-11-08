# Mesoscale pipeline without the VPS

Research follow-up for v1.8 Mesoscale, issues #913, #918, #919, and #921. Sources and live feed checks accessed 8 November 2026 unless a source identifies another date.

## Recommendation

Keep model ingestion out of ordinary Workers. Use a scheduled GitHub Actions workflow in this public repository as the first GRIB processing worker. Fetch only selected GRIB2 messages by byte range, decode and reproject with pinned ecCodes/wgrib2 tooling, create OpenLayers-ready raster tiles, then upload the artifacts and a small catalog to R2. Use the already-funded $5/month Workers Paid plan for Cron Trigger feed checks, catalog/API delivery, and optionally Queues or Workflows for retry orchestration. The included plan should cover an hourly MVP and modest use without added Cloudflare charges, if R2 storage and operation use stay inside the free allowance.

I would launch HRRR and RAP first. Add RRFS behind an early-access switch, with a source/cycle age badge. RRFS is now operational with a stable NOAA open-data bucket and a published NOMADS product path, but a real sample arrived roughly 1h50 after its 00Z initialization. That makes RRFS useful as another model perspective, not a timely observation layer.

For v1.8 composites, offer only fixed-layer formulas when each required input is explicitly present in the selected model file. Label them “GFC-derived from [model] analysis” and expose the formula version. Defer effective-layer STP/SCP, ESRH, and EBWD until GFC has a tested profile-based computation and validation set. They cannot be reproduced by combining generic 2-D fields.

## SPC Mesoanalysis data and reuse

### What is public

The SPC Mesoanalysis website exposes a large menu of fields and the current page includes GIF basemap/overlay assets. Its page source enumerates layer codes such as `sbcp`, `mlcp`, `mucp`, `mlcp_eshr`, helicity, and thermodynamic fields. The legacy page links the graphics under SPC's `exper/mesoanalysis` directories. I did not find a public, documented gridded-data download/API, WMS, or tile endpoint for the live operational maps. The publicly accessible archived SPC analysis of record is described in peer-reviewed work as nominally hourly, 40-km, 36 pressure levels, but that paper's description does not establish an open live endpoint or a reusable machine-readable archive URL.

SPC page retrieval worked from the command line, while the research browser returned 403. The current page HTML was examined directly. SPC's page has a NOAA Weather.gov disclaimer link, but I did not find an SPC-specific reuse license for its composed maps or a published service commitment. NOAA data are generally public domain, but the safe product choice is to link to SPC or display a user-opened official page rather than scrape and redistribute the images as GFC tiles. If GFC does proxy/map them, preserve SPC attribution and source time, do not imply SPC endorsement, avoid aggressive polling, and confirm that every included background/base layer can be redistributed. Treat this as a practical copyright assessment, not legal advice.

Reusing an SPC raster as a visual layer is technically possible but brittle. A user could open the matching GIF/PNG and georeference its map frame from known projection bounds or control points. The layer would inherit the source's map projection, labels, color scale, sector and valid time; cropping, transparency, smoothing, panning and zooming would be constrained. Regularly downloading the graphic also makes GFC dependent on undocumented filenames and caching behavior. Do not bake these images into a purportedly native OpenLayers data layer. A link or optional overlay with prominent SPC attribution is the low-effort bridge.

### What an SPC-like product entails

Published descriptions say SPC's mesoscale analysis combines a RAP background with current surface observations. For the surface objective analysis, 2-m temperature and humidity and 10-m wind are replaced with a two-pass Barnes analysis of current observations. The archived analysis of record uses the full surface observation stream, a 40-km grid, and 36 pressure levels. Recent NOAA research also cautions that the near-ground wind profile and SRH can have material errors; copying the concept does not make a new GFC analysis equivalent to SPC's operational system.

A plausible first version needs observation ingestion and quality control, station elevation/time handling, a model background matched to observation time, an objective analysis, gridding/projection, rendering, and missing/stale station monitoring. Barnes analysis itself is modest: for a CONUS grid with tens of thousands of points, station neighborhoods can be indexed and updated in seconds to a few minutes on a normal runner. The harder cost is reliable station feeds, quality control and scientifically defensible handling of elevation, instrument exposure, sparse regions, duplicate reports, and observation age. Do not promise SPC equivalence based on implementing a Barnes kernel alone.

**MVP recommendation:** first show official SPC as an outbound reference and label HRRR/RAP f00 as model analyses. In a later, separate feature, test a single surface field such as 2-m temperature or dewpoint using METAR observations over a model background. Keep the model's upper-air fields unchanged, document the method and station-age cutoff, and compare against withheld stations and SPC before displaying composite severe-weather diagnostics. A broader “current conditions” panel can then be a distinct product with its own validation.

Open-source reference implementations include MetPy's objective analysis and Barnes weighting utilities and SHARPpy's sounding-derived severe-weather indices. These are useful implementation references, not turnkey data pipelines or validation for a GFC product. NOAA's published description of SPC's SFCOA and current HWT experiment material should guide the algorithm discussion.

## GRIB ingest and rendering

### Is f00 affordable to decode?

Yes, if GFC decodes a small field allowlist once per cycle. No, if every viewer request downloads a whole GRIB or if a Worker tries to decode a full CONUS model file.

The HRRR GRIB files are large, and RRFS's actual 3-km CONUS 2-D-field f000 sample was 303.9 MB. The RRFS `.idx` was 15.7 KB. The index identifies message offsets; GFC can fetch only selected byte ranges, but the index still must be matched against exact parameter, level, step, and units. A byte range contains whole GRIB messages, not a pre-decoded parameter array. The NOAA/NCEP GRIB filter is a second option for server-side parameter/level subsets, subject to its request guidance and availability. Prefer same-cloud-region access when possible; public NOAA S3 data are free to read in-region, while cross-cloud transfer can have egress costs.

Use ecCodes or wgrib2 in a Linux GitHub-hosted runner. cfgrib is a Python interface over ecCodes and is convenient for xarray, but ecCodes still needs native shared libraries and GRIB definitions. wgrib2 has direct inventory/extraction/projection utilities and a smaller job-oriented interface. A WASM decoder might make a small selected file possible in a Worker, but GRIB decoding plus reprojection and a tile pyramid is not a good fit for an hourly Worker with 128 MB memory and a hard CPU cap. WASM also adds build and definition-table complexity. Use a container if the pipeline needs a larger, controlled memory environment.

For an initial realistic scope, target 8–12 two-dimensional CONUS fields per model and cycle: 2-m temperature/dewpoint, 10-m U/V wind, MLCAPE, MLCIN, MLLCL, 0–1 km and 0–3 km SRH, and selected 0–6 km shear if present. Include a small surface pressure/wind or reflectivity context only if it is actually needed. Do not assume each diagnostic is in each model's selected 2-D file. Save a per-cycle manifest from live inventory inspection. If an input is absent, omit that diagnostic. A derived value requires every named input and a model-supported formula.

### GitHub Actions versus Cloudflare compute

Public repositories pay $0 for standard GitHub-hosted runner minutes. The standard Ubuntu runner provides enough CPU and memory for a selected-field decode/reprojection job in ordinary cases. A top-of-hour schedule can run hourly, but scheduled workflows are best effort, can be delayed at busy times, and can be dropped under sufficiently high load; they are not an SLA. GitHub documents a minimum cron interval of five minutes and a 60-day inactivity disable behavior on public repositories. Actions artifacts are temporary workflow artifacts, not the durable public feed. Upload results directly to R2, keep short GitHub logs and maybe a small debug artifact, and ensure the action is idempotent so a missed or duplicate cycle is harmless.

The $5 Cloudflare Workers Paid plan is already in the budget. It includes the following relevant monthly allowances and hard limits under current standard pricing:

| Service | Included with the existing $5 plan | Beyond included usage / limits |
|---|---|---|
| Workers | 10 million requests/month and 30 million CPU milliseconds/month; per HTTP invocation CPU can be configured up to 5 minutes. Memory is 128 MB. | $0.30 per additional million requests and $0.02 per additional million CPU milliseconds. CPU hard maximum 5 min/invocation. |
| Cron Triggers | Up to 250/account; hourly trigger cadence is supported. Scheduled invocation has 15 min wall time, and 15 min CPU maximum when schedule interval is at least hourly. | No extra Cron fee, but the Worker CPU allowance applies. Network wait consumes wall time but not CPU. Cannot use this to bypass the 128 MB memory ceiling. |
| Queues | 1 million operations/month; 10,000 queues included by default, 128 KB/message, 5,000 messages/s/queue, 15 min consumer wall time, up to 5 min CPU per consumer. | $0.40 per million operations above allowance. A normal delivered message uses about three ops (write/read/delete). More queues: $0.10/month each over 10,000. |
| Durable Objects | 1 million requests/month and 400,000 GB-seconds/month on Paid, plus included SQLite allowances matching D1 (25B rows read and 50M rows written/month). | $0.15/million requests, $12.50/million GB-s overage. Avoid a long-lived hot singleton; use hibernation. Not needed for this feed MVP. |
| Workflows | 10M invocations, 30M CPU ms, 1 GB-month storage, and 500,000 steps/month. Included as part of Workers Paid. | $0.30/million invocations, $0.02/million CPU ms, $0.20/GB-month storage, $0.80 per extra 100,000 steps. Workflow step CPU max 5 min; a step can wait without charging CPU. Good retry/state orchestration, not a GRIB runtime escape hatch. |
| Containers | No free-plan container allocation. On Paid, included 375 vCPU-min/month, 25 GiB-hours memory, 200 GB-hours disk. Available as a beta/early access feature in current docs. | $0.000020/vCPU-second, $0.0000025/GiB-second, $0.00000007/GB-second; billed while active, scaling to zero. Container resource types run from 1/16 vCPU + 256 MiB to 4 vCPU + 12 GiB. Included compute is small: 375 vCPU-min is only 6.25 vCPU-hours. Check account/region availability and current GA status before relying on it. |
| R2 Standard | 10 GB-month, 1M Class A ops, 10M Class B ops per month, free internet egress. | $0.015/GB-month, $4.50/million A ops, $0.36/million B ops. Infrequent Access costs differ and has retrieval fees. Allowance is independent of the Workers Paid fee. |

The exact plan is $5 baseline, not $5 plus another $5 for the mesoscale feature. For a small MVP with one hourly ingest, a few fields, ~1 GB of R2 tiles/current data, and hundreds of thousands of tile/catalog requests monthly, the incremental Cloudflare bill should be $0. GitHub-hosted compute is $0 for this public repo. The existing $5 remains the expected recurring baseline. If the hourly decode takes longer or uses more memory than the hosted runner allows, then a Cloudflare Container is not automatically free: its included monthly vCPU time is tight, and a 2-vCPU job running two minutes each hour would consume 2,880 vCPU-minutes over 30 days, or roughly $3.01 in additional CPU charges after the 375-minute inclusion (compute formula from current published rates), before memory. The better fallback is another free public-repo Actions runner or an opt-in paid compute service, not constant container polling.

Cloudflare ordinary Workers have enough CPU ceiling for request handling, a catalog refresh, and small arithmetic. They do not have enough memory for a native model grid decode or a realistic GRIB-to-tile pipeline: 128 MB maximum. The 15-minute Cron wall/CPU window is not the controlling constraint for the recommended GitHub pipeline; the 128 MB memory and decode library support are.

### Tiles and expected volume

For OpenLayers, make server-generated XYZ PNG tiles the default MVP. They need no client meteorology and can use pre-colored scalar fields, transparent nodata, and an explicit ramp/units legend. Serve them from R2 through a cacheable Worker or public R2 custom domain. Store cycle/model/field/valid-time metadata separately. Keep user-selected ramping for later. It would require numeric tiles or raw float tiles, and those are much larger and more complex than PNGs.

Vector contours are useful for a few isolines but cost more server CPU to generate and can produce large, noisy vector payloads. They are not the best first format for 8–12 continuous fields. A practical MVP can store a reduced native/regular grid as compressed float tiles or Zarr/COG only if numeric inspection, custom styling, or downloadable data becomes a stated requirement. PNG display does not imply weather calculations in GFC; all analysis is upstream.

Planning estimate, to be measured in a prototype: selected byte ranges for eight to twelve 2-D messages across a CONUS cycle may total 20–100 MB, depending on model, field sizes and whether the index can select every needed message cleanly. Runner wall time may be about 2–10 minutes per cycle for subset fetch, decode, reprojection, tile generation at a limited zoom pyramid, and upload. This is an estimate, not a benchmark. At 24 cycles/day it is 1–4 runner-hours daily, free for a public repository on standard runners. Targeting one PNG layer per field with a 3–5 zoom pyramid and retaining only the latest 6 cycles should usually stay under 10 GB R2; measured compressed tile output must replace this estimate before launch. Estimate 0.2–1 GB per model/cycle for tile outputs across 8–12 fields and broad zooms as a conservative envelope. Retention and generating only occupied tiles can lower it significantly.

## RRFS operational status and sample check

RRFS v1 became operational 14 October 2026, according to the NOAA Open Data on AWS operational registry. It provides hourly deterministic guidance to 18 h, and extended deterministic/ensemble output on four synoptic cycles. The operational bucket is `s3://noaa-rrfs-ops-pds` in `us-east-1`, readable anonymously, and NOAA lists a production feed through NOMADS. Its naming and structure are documented in the NOAA registry and NCEP inventory. The older `noaa-rrfs-pds` registry is explicitly the prototype bucket, so do not point production at it.

I fetched a real, unsigned S3 ListObjectsV2 sample for prefix `rrfs.20261108/00/`. It returned the actual object listing, including:

| Object | Size | Last modified |
|---|---:|---|
| `rrfs.t00z.2dfld.3km.f000.conus.grib2` | 303,924,757 bytes (289.8 MiB) | 2026-11-08 01:50:13Z |
| `rrfs.t00z.2dfld.3km.f000.conus.grib2.idx` | 15,741 bytes | 2026-11-08 01:50:20Z |
| `rrfs.t00z.2dfld.13km.f000.na.grib2` | 131,912,391 bytes | 2026-11-08 01:52:38Z |
| `rrfs.t00z.2dfld_awipsubset.3km.f000.na.grib2` | 130,726,050 bytes | 2026-11-08 01:54:06Z |

That is a stable operational endpoint and actual sample-file listing. It is only one cycle observation. It does not establish guaranteed delivery cadence, latency, file completeness or output field availability for every cycle. In this case f000 appeared about 110 minutes after initialization. RRFS is therefore appropriate as a beta model source with observed ingest lag shown to users. Do not describe its f000 as “current.”

## Derived severe-weather parameters

Composite parameters are environmental indices, not storm predictions. Their source studies stress that thresholds depend on sample/context and can mislead when linear convective modes dominate. GFC should make the exact variant and source obvious.

The original Thompson, Edwards and Hart (2003) formulations use mixed-layer or most-unstable parcel diagnostics and fixed height layers:

```text
SCP = (MUCAPE / 1000 J kg-1)
    * (0-3 km SRH / 150 m2 s-2)
    * (BRN shear denominator / 40 m2 s-2)

STP_fixed = (MLCAPE / 1000 J kg-1)
    * (0-6 km bulk vector shear / 20 m s-1)
    * (0-1 km SRH / 100 m2 s-2)
    * ((2000 m - MLLCL) / 1500 m)
```

The original paper also documents a CIN-limited variant, multiplying by `((150 J kg-1 - MLCIN) / 125 J kg-1)`. SPC's currently illustrated “STP (fixed layer)” and “STP (effective layer)” need to be checked against its current parameter documentation before claiming exact parity. The fixed expression can be negative when LCL exceeds 2 km; clipping conventions vary by implementation. Preserve the formula's documented sign/clamp choice in the field metadata and regression fixtures.

The later effective-layer formulation changes the relevant storm inflow and shear layers. The effective inflow layer is found from a vertical thermodynamic profile using parcels that meet CAPE/CIN criteria. Effective SRH (ESRH) integrates storm-relative helicity through that layer, and effective bulk wind difference (EBWD) uses the layer boundaries tied to the effective storm depth. Common operational expressions are:

```text
SCP_effective = (MUCAPE / 1000)
               * (ESRH / 50)
               * (EBWD / 20)

STP_effective (CIN variant) = (MLCAPE / 1500)
                            * (ESRH / 150)
                            * (EBWD / 12)
                            * ((2000 m - MLLCL) / 1000 m)
                            * ((MLCIN + 200) / 150)
```

These expressions need the precise Thompson et al. 2004/2007/2012 version and limits documented alongside implementation. In particular, the CIN factor for effective STP is not the same as the original fixed-layer CIN factor. Use SHARPpy as a code reference and compare selected profiles against SPC/NSHARP; do not synthesize “effective” values from fixed 0–1/0–3 km helicity and fixed 0–6 km shear.

EHI is `CAPE * SRH / 160,000` for a specified parcel and SRH layer; common labels include EHI 0–1 km and EHI 0–3 km. Both inputs and the chosen parcel/layer matter. A value without layer metadata is ambiguous.

Native-field reality is product-specific. HRRR/RAP/RRFS have temperature, moisture and winds in profile products, and some products emit CAPE/CIN, LCL, helicity or layer shear as precomputed 2-D messages. Exact parameter, layer, parcel, level type and units can vary by model and product; do not promise that every model's 2-D file contains MLCAPE, MLLCL, MLCIN, 0–1/0–3 SRH and 0–6 shear. I verified RRFS f000 files exist, but did not decode that sample's index to establish a complete message matrix. Before any composite goes live, inventory one file for every supported model/product and save the GRIB identifiers as a manifest.

Grid arithmetic for a fixed-layer composite is trivial once the 2-D fields are available: a few floating-point operations for each of roughly 1–2 million CONUS grid points. This should take seconds to tens of seconds on a standard runner, well below download/reprojection time. Effective-layer calculation needs vertical temperature/moisture/wind profiles and parcel lifting/integration per grid column. At e.g. 50–80 vertical levels across ~1–2 million columns, this means tens to hundreds of millions of thermodynamic/hodograph operations and more memory/I/O. It is still feasible in an offline native pipeline, but significantly more expensive and needs meteorological library validation. Avoid it for v1.8 unless the model vendor supplies the exact effective diagnostics natively.

**v1.8 recommendation:** only expose a documented fixed-layer product, likely SCP and STP-fixed where inputs are confirmed. Consider EHI only with an explicit parcel and SRH layer. Omit CIN-limited STP until exact SPC variant/clipping semantics are verified. Effective-layer STP/SCP, ESRH and EBWD are later work. In every legend and export say “GFC-derived,” name the input model/cycle, show formula revision and distinguish model field from GFC calculation. Do not present these as official SPC values.

## Recommended architecture and cost

1. A GitHub Actions workflow runs hourly in this public repository. It checks NOAA's cycle listing and determines whether a newer complete file exists. Use retries with bounded backoff, lock/idempotency by `(model, cycle)`, and a 10–20 minute grace period for late products. It should not depend on a single exact cron minute.
2. The workflow selects required GRIB messages from `.idx` inventories, downloads byte ranges from the provider, decodes with a pinned ecCodes or wgrib2 Linux container, reprojects once to EPSG:3857, and renders a measured limited zoom range of XYZ PNG tiles. Keep source object key, message IDs, units, processing version, run log, valid time, publish time and checksum in the catalog.
3. Upload tiles and compact JSON catalog to R2. Retain only a configured recent-cycle window and delete stale/partial products. Do not use GitHub artifacts as the live origin.
4. A Workers Paid Worker serves catalog and tiles with cache headers, stale indicators, and a status endpoint. Cron checks feeds and publishes health metadata. Add Queues or Workflows only if replay/retry orchestration needs them; hourly ingestion volume is small enough for a plain workflow initially.
5. GFC's OpenLayers client selects/styles layers and displays age. It does not decode GRIB or calculate meteorology.

The following monthly model uses the existing $5 plan as a sunk baseline. At 0 users, $5. At 100 or 1,000 users, still $5 if R2 and Worker allowances hold. The scale risk is tile request volume, not users directly: one user can pan/zoom hundreds of tiles. Assume latest 6 cycles, 8–12 fields, <10 GB R2, <10M Worker requests and <30M CPU ms, under 1M Queue operations, and no paid containers. GitHub Actions runner cost is $0 for this public repo. NOAA bucket access is $0 when reads remain in AWS US East. This table excludes any separate domain, telemetry vendor, and engineering time.

| Monthly active users | Expected recurring total | What fits in the existing plan | Likely charge trigger |
|---:|---:|---|---|
| 0 | $5 baseline | Hourly Actions ingest, modest tiles in R2 free allowance, Worker catalog, Cron health check. | Any R2 overage or intentional paid container use. |
| 100 | $5 baseline | Same. At 10,000 tile requests/user/month = 1M Worker requests, comfortably below the 10M included; R2 reads also below 10M if each tile is requested once. | Retaining >10 GB-month, >1M writes, >10M reads, or >10M Worker requests. |
| 1,000 | $5 baseline in likely MVP use | 10M tile requests/month reaches the Worker request inclusion. If requests mostly serve from Worker cache, Worker request charges still count; static R2 custom-domain requests avoid Worker request charges but must be tested for desired headers/CORS. R2 Class B allowance remains 10M, so caching is useful. | Above 10M Worker requests adds $0.30/million. Above 10M R2 reads adds $0.36/million. Above R2 free storage adds $0.015/GB-month. Extra Worker CPU adds $0.02/million ms. |

Container example: assume a 2-vCPU instance runs for two minutes each hour and fully uses both vCPUs. It consumes `2 vCPU * 2 min * 24 * 30 = 2,880 vCPU-min/month`. After 375 included minutes, CPU overage is approximately `(2880 - 375) * 60 * $0.000020 = $3.01`. A 4-GiB instance at that runtime uses 96 GiB-hours, adding about `$0.64` beyond the 25 GiB-hour allowance. A 1-vCPU job using two CPU-minutes hourly consumes 1,440 vCPU-min/month and costs about `$1.28` in CPU overage. Actual billing depends on active runtime and provisioned memory, so benchmark the chosen instance. This is why GitHub Actions is preferable for the first decoder, even though the Workers Paid plan is already funded.

Failure modes and monitoring:

- NOAA delays or misses a cycle. Never relabel the prior cycle as current. Show last valid time and age. Retry a few times, then mark delayed.
- `.idx` or GRIB message inventory changes. Validate a manifest of GRIB parameter/level/units/step on each model version. Reject unknown or missing required inputs rather than silently substituting.
- Partial or corrupt download. Verify HTTP range status, byte counts, GRIB decode success, and output checksums before atomically publishing the new catalog pointer.
- Scheduled Actions delay/disable. Set a workflow activity reminder or separate lightweight monitor, alert on missed hourly publish, and ensure the schedule exists in the default branch. Actions scheduling is best effort.
- NOAA endpoint throttling or cloud transfer unexpectedly billed. Use NOAA's published request guidance, bounded concurrency, conditional requests, and track downloaded bytes. Keep an R2 fallback copy of the most recent products.
- R2 storage/request or Worker allowances exceeded. Record monthly operation counters and alerts at 70/85/95 percent. Apply cycle retention and cache controls. Do not allow unbounded forecast-hour/zoom tile generation.
- Container beta, Worker deployment, or Cloudflare feature availability changes. The core ingest must continue to work as an Actions job. Cloudflare should store and serve, not be a single dependency for model decoding.
- Stale or flawed data. Catalog should report `sourceCycle`, `validTime`, `receivedAt`, `processedAt`, `ageMinutes`, and status. A daily feed-health summary should include per-model expected/actual cycle, last successful decode, completeness, and tile count.

## Maintainer decisions

1. Is the initial “current” view the SPC link/reference, an explicitly labeled HRRR/RAP model analysis, or a separately scoped surface-observation analysis? I recommend the first two now.
2. Which 8–12 fields and zoom levels are required for the MVP? Each adds decoding, storage, legends and quality checks.
3. Does “early access RRFS” mean a visible opt-in model selector with a delayed/stale badge? I recommend that, based on the observed 110-minute f000 latency.
4. Which exact fixed-layer composite formulas and negative/clipping conventions should v1.8 expose? I recommend SCP and fixed-layer STP after sample inventories and SPC comparison; defer the rest.
5. Is the monthly request/retention budget assumption acceptable? A tile quota or retention window may need adjustment after measuring real client use.
6. Who owns monitoring the public GitHub schedule, NOAA inventories, and monthly Cloudflare use?

## What I could not verify

- SPC's web page and layer image directory work, but I did not locate an official public live grid/API or an SPC-specific image redistribution license. I also could not verify a live SPC gridded archive download URL.
- I did not make a complete field-by-field GRIB inventory for current HRRR, RAP and RRFS files. The live RRFS listing verified f000 file existence and size, not every native diagnostic message.
- One RRFS cycle proves that the operational bucket endpoint works and exposes actual files. It does not establish a publish SLA or representative latency distribution.
- The per-cycle selected-message byte total, tile storage and 2–10-minute processing estimate are planning values, not a GFC benchmark. Measure them on the exact field set and zoom pyramid before launch.
- Current Cloudflare docs identify Containers as beta/early access in parts of the product documentation. I did not confirm beta availability or a GA date for this specific account. Avoid making it an MVP dependency.
- GitHub Actions schedule reliability is explicitly best-effort. No external runner SLA was found for this small scheduled workflow.

## Sources

- SPC current Mesoanalysis pages: [main page](https://www.spc.noaa.gov/exper/mesoanalysis/), [current interactive page](https://www.spc.noaa.gov/exper/mesoanalysis/new/). SPC page source was fetched on 8 Nov 2026; it enumerates graphic fields and GIF assets. Main page is rated last reviewed in 2006 in page metadata.
- NOAA peer-reviewed description of SPC SFCOA and its limitations: [Coniglio and Jewell, 2022, Monthly Weather Review](https://repository.library.noaa.gov/view/noaa/45382/noaa_45382_DS1.pdf).
- NOAA/NSSL HWT 2025 operations: [HWT Spring Forecasting Experiment operations plan](https://hwt.nssl.noaa.gov/sfe/2025/docs/HWT_SFE2025_operations_v3.pdf).
- Thompson, Edwards and Hart, 2003: [Evaluation and Interpretation of the Supercell Composite and Significant Tornado Parameters at the SPC](https://ams.confex.com/ams/pdfpapers/46942.pdf).
- Thompson, Edwards and Mead, effective SRH research: [AMS conference paper](https://ams.confex.com/ams/11aram22sls/techprogram/paper_81315.htm); [SPC NSHARP parameter reference](https://vlab.noaa.gov/web/oclo/nsharp-hail-and-tornado-reference).
- NOAA NODD operational RRFS registry: [RRFS/REFS Operational on AWS](https://registry.opendata.aws/noaa-rrfs-ops/). Prototype registry: [RRFS prototype bucket](https://registry.opendata.aws/noaa-rrfs/). Product inventory: [NCEP RRFS](https://www.nco.ncep.noaa.gov/pmb/products/rrfs/). Sample listing fetched directly from anonymous S3 ListObjectsV2 for `rrfs.20261108/00/` on 8 Nov 2026.
- GRIB tools and format: [NCEP wgrib2](https://www.cpc.ncep.noaa.gov/products/tools/wgrib2/index.html), [NCEP GRIB2 documentation](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/), [cfgrib](https://github.com/ecmwf/cfgrib), [ecCodes](https://github.com/ecmwf/eccodes), [SHARPpy](https://github.com/sharppy/SHARPpy), [MetPy objective analysis](https://unidata.github.io/MetPy/latest/api/generated/metpy.interpolate.html).
- GitHub Actions public-runner billing: [GitHub billing and usage](https://docs.github.com/en/actions/concepts/billing-and-usage), [workflow syntax and schedule](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#onschedule).
- Cloudflare: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [limits](https://developers.cloudflare.com/workers/platform/limits/), [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [Queues limits](https://developers.cloudflare.com/queues/platform/limits/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
