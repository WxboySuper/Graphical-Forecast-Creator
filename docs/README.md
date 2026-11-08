# Documentation

Docs are split by audience.

| Audience | Start here | Style |
|----------|-----------|-------|
| **You (the owner / any human)** | [`docs/guide/`](./guide/README.md) | Explanatory, diagrams, tables |
| **Coding agents** | [`/AGENTS.md`](../AGENTS.md) then [`docs/agents/`](./agents/README.md) | Terse rules and contracts |

The rest of `docs/` is **reference**: detailed contracts and runbooks that both guides link to. Read them when a task touches that area.

## Human guide

1. [What GFC is](./guide/01-what-is-gfc.md)
2. [How the code is organised](./guide/02-architecture.md)
3. [Hosting and services](./guide/03-hosting-and-services.md)
4. [Shipping code](./guide/04-shipping-code.md)
5. [Feature gating](./guide/05-feature-gating.md)
6. [Automation](./guide/06-automation.md)
7. [Working with agents](./guide/07-working-with-agents.md)
8. [Product and data reference](./guide/08-product-and-data-reference.md)
9. [Decisions, open questions, risks](./guide/09-decisions-and-risks.md)

## Agent docs

[Index](./agents/README.md) · [Workflow](./agents/workflow.md) · [Codebase](./agents/codebase.md) · [Testing](./agents/testing.md) · [Feature exposure](./agents/feature-exposure.md) · [Release ops](./agents/release-ops.md) · [Lookup tables](./agents/reference.md) · [CI and gotchas](./agents/ci-and-gotchas.md)

## Code boundary guides

Short guides live beside the code. Read the relevant one before moving a module or adding a cross-cutting dependency.

### Frontend guides

- [Frontend overview](../src/README.md)
- [Authentication](../src/auth/README.md)
- [Billing](../src/billing/README.md)
- [Components](../src/components/README.md)
- [Configuration](../src/config/README.md) - build targets, exposure registry, navigation metadata, gated surfaces, server-capability status, and vendored boundary sources.
- [Content](../src/content/README.md)
- [Feature exposure](../src/features/README.md)
- [Hooks](../src/hooks/README.md)
- [Libraries](../src/lib/README.md)
- [Maps](../src/maps/README.md)
- [Metrics](../src/metrics/README.md) - read-only `userMetrics` hook that feeds progress numbers to the account page.
- [Monitor](../src/monitor/README.md)
- [Mesoscale client](../src/mesoscale/README.md)
- [Pages](../src/pages/README.md)
- [Routing](../src/routing/README.md)
- [Store](../src/store/README.md)
- [Testing](../src/testing/README.md)
- [Types](../src/types/README.md)
- [Utilities](../src/utils/README.md)

### Server guides

- [Server overview](../server/README.md)
- [Server library](../server/lib/README.md)
- [Server release](../server/release/README.md)
- [Server testing](../server/testing/README.md)
- [Server weather](../server/weather/README.md)

### Ingest guides

- [Mesoscale model ingest](../scripts/mesoscale/README.md)

When a change crosses a boundary, update the relevant doc in the same PR.

## Reference

### Architecture contracts

- [Repository map](./architecture/codebase-inventory.md)
- [Forecast workspace boundaries](./architecture/forecast-workspace-boundaries.md) (v1.8 plan) and [implemented route/state decisions](./architecture/forecast-workspace-route-state-914.md)
- [Cloud-cycle storage](./architecture/cloud-cycle-storage.md)
- [Deterministic Redux transitions](./architecture/deterministic-redux-transitions.md)
- [Discussion wall-clock times](./architecture/discussion-wall-clock-times.md)
- [Forecast map styling seam](./architecture/forecast-map-styling-seam.md)
- [Mesoscale provider contract](./architecture/mesoscale-provider-contract.md)
- [Mesoscale catalog contract](./architecture/mesoscale-catalog-contract.md) · [ingest operations](./architecture/mesoscale-ingest-operations.md)
- [Precision polygon editing](./architecture/precision-polygon-editing-624.md)

### Product rules

- [Outlook information](./product/outlook-info.md)
- [Specialty styles](./product/specialty-style-policy.md)
- [Custom layers and products](./custom-products.md)
- [Import and export formats](./product/kmz-export.md)

### Operations

- [Release workflow](./operations/release-workflow.md) · [Beta releases](./releasing-beta.md) · [Hosted rollout](./operations/hosted-rollout.md)
- [Alert banner](./operations/alert-banner.md) · [Emergency feature disable](./operations/emergency-feature-disable.md)
- [Firestore retention](./operations/firestore-retention.md) · [rules deployment](./operations/firestore-rules-deployment.md) · [rules verification](./firestore-rules-verification.md)
- [Auto-TSTM operations](./operations/auto-tstm-operations.md) · [beta test plans](./operations/auto-tstm-beta-test-plans.md) · [custom products test plan](./operations/custom-products-beta-test-plan.md)
- [Feature exposure testing](./operations/feature-exposure-testing.md) · [workstreams](./operations/feature-exposure-workstreams.md) · [v1.7 exposure matrix](./operations/v1.7-exposure-matrix.md)
- [OpenCode maintenance](./operations/opencode-maintenance.md) · [GitHub-Todoist sync](./github-todoist-sync.md)
- [Support and privacy](./operations/v1.7-support-and-privacy.md) · [Umami](./operations/umami-telemetry.md) · [Umami privacy](./operations/umami-telemetry-privacy-operations.md)
- [Public status schema](./public-status-schema.md) · [Workflow analytics](./workflow-analytics.md) · [Coverage exclusions](./coverage-exclusions.md)

### Data and research

- [Geo boundary datasets](./geo-boundary-datasets.md) · [NOAA data](./data/noaa-dat.md) · [Monitor reference sources](./operations/monitor-reference-sources.md) · [WorldPop evaluation](./research/622-worldpop-evaluation.md)

## Housekeeping

- `docs/personal/` is git-ignored: local plans, generated inventories (`pnpm run docs:inventory`) and the local docs site (`pnpm run docs:site`).
- Plans, investigations, and release notes are point-in-time. Keep them in the issue/PR; `CHANGELOG.md` is the release record.
