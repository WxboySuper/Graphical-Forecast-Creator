# Workflow analytics event dictionary

Workflow events use `trackProductEvent` in `src/lib/productAnalytics.ts`. It checks event names and permitted workflow properties before sending or queuing an event. Unknown dimensions, invalid enum values, and nested content are rejected. Tracker errors do not interrupt forecast editing, saving, completion, export, or rollover.

## Events

The workflow event names are `workflow_start`, `workflow_continue`, `workflow_derive`, `workflow_revise`, `workflow_complete`, `workflow_complete_with_omissions`, `forecast_exported`, and `workflow_rollover_action`. Export events may carry a normalized `failure` result. The same product analytics module also handles its registered non-workflow events.

## Dimensions

Permitted dimensions are `dayGrouping`, `accountTier`, `entryPath`, `result`, `packageScope`, and `action`. Values are closed enums. Coordinates, geometry, discussions, labels, filenames, images, package contents, map/layer state, raw errors, and arbitrary metadata are prohibited.

Tracking requires an explicit local opt-in, including for signed-out visitors. Only the production and beta GFC hostnames enable telemetry, with separate configured website IDs. Localhost and other hosts do not emit events. Disabling tracking removes the injected script and clears queued telemetry. The configured retention period is not verified in this repository.
