# Workflow analytics event dictionary

Opt-in product events use `trackEvent` in [`src/lib/telemetry`](../src/lib/telemetry). The client accepts only the shared event allowlist and optional short, validated details. It sends nothing until consent is `granted`. Tracker errors do not interrupt forecast editing, saving, completion, export, or rollover.

## Events

The product event names are `page_view`, `forecast_created`, `forecast_exported`, `forecast_shared`, `forecast_saved_cloud`, `mesoscale_layer_opened`, `verification_used`, `map_layer_changed`, `premium_feature_used`, and `error_shown`.

## Dimensions

`detail`, when present, is limited to a short page, layer, feature, or error type name. Coordinates, geometry, discussions, labels, filenames, images, package contents, map/layer state, raw errors, identity, and arbitrary metadata are prohibited.

The client also sends `/v1/visit` without consent and `/v1/active` after sign-in. These are separate counters from opt-in product events. See [telemetry operations](./operations/telemetry.md) for the data and endpoint contract.
