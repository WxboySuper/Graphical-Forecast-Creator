# Mesoscale provider contract

Issue: [#918](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/918)

`src/mesoscale/` defines the provider boundary shared by future Mesoscale Forecast
and read-only Monitor consumers. No provider is selected here. The supported model
IDs are HRRR, RAP, and RRFS. Each response carries its model's available parameter
IDs, maximum forecast hour, and cycle cadence as provider/adapter capabilities.
Those values are data, not assumptions baked into consumers. An adapter maps its
response into schema version 1, then calls `normalizeProviderPayload` before
handing data to a consumer.

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
