# Mesoscale client

This folder owns the provider contract, Worker catalog client, React data hooks,
offline fixtures, and OpenLayers raster-layer helpers. It does not calculate
weather fields or own workspace and Monitor UI.

The client reads `/latest/{model}.json`, `/catalog/{model}/{cycle}.json`, and
`/status` from the configured mesoscale Worker. It validates cycle identity,
normalizes each catalog parameter through `normalizeProviderPayload`, and keeps
loading, partial, stale, malformed, and upstream-failure states distinct.

`useMesoscaleLatest` reads a model's published pointer.
`useMesoscaleFrames` reads a specific published cycle and separates f00 analysis
from f01+ forecast frames. `useMesoscaleStatus` reads Worker health. These hooks
abort in-flight requests on cleanup and refresh displayed age every 30 seconds.

Map consumers can call `createMesoscaleTileLayer` for one catalog parameter and
`syncMesoscaleLayers` to retain stable layer instances while changing order or
opacity. See [the provider contract](../../docs/architecture/mesoscale-provider-contract.md)
and [Worker operations](../../docs/operations/mesoscale-worker.md) for data and
configuration details.

Local fixtures require `mesoscaleWorkspace` exposure and the local-only
`VITE_MESOSCALE_FIXTURES=true` build setting. Hosted build targets stay gated.

For a full local demo of the Mesoscale workspace, also set
`VITE_MESOSCALE_DEMO=true` (ignored outside the local target). It serves fresh,
clearly labeled placeholder data: HRRR f00-f06, RAP and RRFS f00, eleven fields,
and one tile image per field in `public/mesoscale-demo/`. Demo data is never real
model output and the workspace says so on screen. The workspace UI lives in
`src/components/Mesoscale/`.
