# Mesoscale provider contract

Issue: [#918](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/918)

`src/mesoscale/` defines the provider boundary and shared catalog client used by
future Mesoscale Forecast and read-only Monitor consumers. No provider is selected here. The supported model
IDs are HRRR, RAP, and RRFS. Each response carries its model's available parameter
IDs and maximum forecast hour as provider/adapter capabilities. Cycle cadence is
optional when a source does not publish it. These values are data, not
assumptions baked into consumers. An adapter maps its
response into schema version 1, then calls `normalizeProviderPayload` before
handing data to a consumer.

Adapters map vendor responses to the exported flat `MesoscaleProviderPayload`
input type before calling the normalizer. Timestamps require an explicit timezone,
and `validTime` must equal `cycleTime` plus `forecastHour`.

Frames identify themselves as `analysis` or `forecast`. Analysis frames use f00;
forecast frames use forecast hours after f00. `ageMs` is calculated from valid
time against the supplied `now` (or the current clock). A caller may provide a
staleness threshold; the normalizer returns `stale` when the age exceeds it, or
when the adapter marks the response stale. The cycle time, valid time, forecast
hour, and frame type remain available for display. A latest-cycle resolver uses
`MesoscaleLatestCycleResolution`; `not-yet-available` means the newest expected
cycle has not been published, and may include the latest available and expected
cycle times plus a suggested retry delay.

`MESOSCALE_CURRENT_CONDITIONS_PREFERENCE` records the default selection: HRRR,
analysis, f00, latest available cycle. This is a preference for the primary
current-conditions view, not a restriction on consumers that select RAP, RRFS,
or a forecast frame.

The normalized response retains model, cycle time, forecast hour, valid time,
domain, source attribution, parameter identity, units, level, legend, display
type, and provider data. The normalizer validates those fields and passes the
data through unchanged. It does not derive or convert meteorological values.
STP, SCP, EHI, and other composites are accepted only when the provider supplies
them. A field the provider does not return stays omitted or appears in
`unavailableParameters`; adapters must not fill it with a calculation or guess.

Consumers can distinguish `loading`, `ready`, `partial`, `stale`, `malformed`,
and `upstream-failure`. Partial responses retain available values and identify
missing requested fields. Stale responses retain the source timestamp and data
while exposing a stale state. Source metadata must identify the provider,
dataset, and attribution. The optional source URL field can carry a provider
supplied reference without choosing an endpoint in this contract.

The SPC Mesoanalysis page is a reference for RAP-based analysis conventions, not
a data source for this contract. The fixtures are normalized adapter-boundary
examples, not captures from a chosen vendor. A provider integration must document
its source's timestamp, unit, level, domain-coordinate, and attribution semantics
before it is exposed to users. This contract adds no route, workspace state, or
feature exposure; `mesoscaleWorkspace` remains off.

`src/mesoscale/client.ts` reads the Worker latest pointer, cycle catalog, and
status routes. It validates pointer and catalog identity before returning data.
It never substitutes another cycle when a requested catalog is missing or its
cycle does not match. Catalog frames are adapted to the provider payload shape
and passed through `normalizeProviderPayload`; tile descriptors remain provider
data. `src/mesoscale/hooks.ts` selects f00 analysis separately from
f01+ forecast frames and recomputes age from cycle time every 30 seconds.

OpenLayers consumers can build `xyz-raster` layers with
`createMesoscaleTileLayer` and keep stable layer instances with
`syncMesoscaleLayers`. Legend stops, units, and attribution come from catalog
metadata. The adapter supplies model capability metadata required by the
provider normalizer from the catalog's available frame data and leaves cycle
cadence unspecified because the catalog does not publish it. It does not
calculate or transform weather values.

The Worker URL is configured at build time with
`VITE_MESOSCALE_WORKER_URL_LOCAL`, `_BETA`, `_STAGING`, and `_PRODUCTION`.
`VITE_MESOSCALE_WORKER_URL` is a fallback for all targets. Fixture mode is local
only and enabled with `VITE_MESOSCALE_FIXTURES=true`; it imports the checked-in
provider fixtures and uses the static 8 by 8 transparent tile placeholder at
`/mesoscale-fixtures-tile.png`. Network requests remain disabled when
`mesoscaleWorkspace` is not exposed, except for this explicit local fixture mode.
