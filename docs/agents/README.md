# Agent docs

Audience: coding agents working in this repo. Terse, rule-first, verifiable. Humans should read [`docs/guide/`](../guide/README.md) instead.

Entry point is [`/AGENTS.md`](../../AGENTS.md). Load only what the task needs:

| Task | Read |
|------|------|
| Any change (branching, commits, PR body, changelog, validation) | [workflow.md](workflow.md) |
| Locating code, deciding where new code goes | [codebase.md](codebase.md), then the `README.md` in the target folder |
| Writing or fixing tests, doc comments | [testing.md](testing.md) |
| Adding/changing/gating a feature, server capability, premium behaviour | [feature-exposure.md](feature-exposure.md) |
| Release, deploy, VPS, hotfix, rollback, secrets | [release-ops.md](release-ops.md) |
| Routes, API, Firestore, env vars, storage keys, limits | [reference.md](reference.md) |
| CI jobs, local reproduction, known traps | [ci-and-gotchas.md](ci-and-gotchas.md) |

## Deep reference (read on demand, treat as contracts)

| Area | Doc |
|------|-----|
| Forecast workspace routes/state/persistence | [forecast-workspace-boundaries](../architecture/forecast-workspace-boundaries.md), [route-state-914](../architecture/forecast-workspace-route-state-914.md) |
| Cloud cycle storage | [cloud-cycle-storage](../architecture/cloud-cycle-storage.md), [firestore-rules-verification](../firestore-rules-verification.md) |
| Redux determinism | [deterministic-redux-transitions](../architecture/deterministic-redux-transitions.md) |
| Discussion times | [discussion-wall-clock-times](../architecture/discussion-wall-clock-times.md) |
| Map styling | [forecast-map-styling-seam](../architecture/forecast-map-styling-seam.md) |
| Polygon editing | [precision-polygon-editing-624](../architecture/precision-polygon-editing-624.md) |
| Mesoscale providers | [mesoscale-provider-contract](../architecture/mesoscale-provider-contract.md) |
| Outlook rules, styles, exports | [outlook-info](../product/outlook-info.md), [specialty-style-policy](../product/specialty-style-policy.md), [kmz-export](../product/kmz-export.md), [custom-products](../custom-products.md) |
| Telemetry | [workflow-analytics](../workflow-analytics.md), [umami-telemetry](../operations/umami-telemetry.md), [umami privacy](../operations/umami-telemetry-privacy-operations.md) |
| Public API schema | [public-status-schema](../public-status-schema.md) |
| Datasets / research | [geo-boundary-datasets](../geo-boundary-datasets.md), [noaa-dat](../data/noaa-dat.md), [monitor-reference-sources](../operations/monitor-reference-sources.md), [622 WorldPop](../research/622-worldpop-evaluation.md) |

## Documentation rules for agents

- Update the relevant doc in the same PR when a path, boundary, contract, or procedure changes.
- Do not add point-in-time status docs (plans, investigations, release notes). Put them in the issue/PR; `CHANGELOG.md` is the release record.
- Do not commit generated inventories or personal notes; they go under ignored `docs/personal/`.
- Link, don't copy. One fact lives in one place.
- Human-facing explanation goes in `docs/guide/` (headings, tables, diagrams). Agent-facing rules go here.
