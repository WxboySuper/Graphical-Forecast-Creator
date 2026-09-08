# Documentation

Use this page as the starting point for repository documentation. Documents
listed under **Current guidance** describe the behavior or workflow contributors
should follow today. Documents under **Historical and exploratory material**
preserve release context or investigation results; they are references, not
current implementation contracts.

## Code boundary guides

The source tree has one short guide per broad code area. Read the guide before
moving a module or adding a new cross-cutting dependency:

- [Frontend source](../src/README.md) - page, component, hook, store, utility, and feature ownership.
- [Pages](../src/pages/README.md) - route-level composition and navigation.
- [Monitor](../src/monitor/README.md) - weather sources, normalization, layers, and monitor state.
- [Store](../src/store/README.md) - Redux state ownership and transitions.
- [Utilities](../src/utils/README.md) - pure transformations, serialization, persistence, and exports.
- [Server](../server/README.md) - hosted services and server-side boundaries.

When a change crosses one of these boundaries, update the relevant architecture
or operations document in the same pull request. Keep generated inventories and
one-off investigation notes under `docs/personal` or the archive sections.

## Choosing a document

| If you are changing... | Start with... |
| --- | --- |
| route composition, state ownership, or feature exposure | [Repository map](./architecture/codebase-inventory.md) and [workspace boundaries](./architecture/forecast-workspace-boundaries.md) |
| release, rollout, or support behavior | [Operations guides](./operations/release-workflow.md) |
| product rules or export formats | [Product guides](./product/outlook-info.md) |
| tests or test cleanup | [Current testing guidance](#current-guidance-testing) and the module's colocated tests |
## Architecture

- [Repository map and architecture overview](./architecture/codebase-inventory.md) - product surfaces, boundaries, entry points, and safe future move direction.

## Current guidance: Operations

- [Release workflow](./operations/release-workflow.md) - release and deployment procedures.
- [Hosted rollout](./operations/hosted-rollout.md) - VPS rollout and troubleshooting.
- [Alert banner](./operations/alert-banner.md) - runtime banner shape and timed-release banner behavior.
- [Emergency feature disable](./operations/emergency-feature-disable.md) - server-side emergency shutoff for server-backed beta capabilities.
- [Feature exposure workstreams](./operations/feature-exposure-workstreams.md) - v1.7 rollout registry adoption manifest.
- [v1.7 exposure matrix](./operations/v1.7-exposure-matrix.md) - cross-feature target exposure and release evidence contract.
- [v1.7 acceptance matrix](./operations/v1.7-acceptance-matrix.md) - desktop, mobile, account-state, and disabled-feature acceptance evidence.
- [Feature exposure testing](./operations/feature-exposure-testing.md) - disabled-side-effect fixture and coverage contract.
- [Forecast workspace boundaries](./architecture/forecast-workspace-boundaries.md) - v1.8 route, state, persistence, and exposure contract.
- [v1.7 support and privacy operations](./operations/v1.7-support-and-privacy.md) - release support triage, limitations, and privacy-request handling.
- [v1.7 release-candidate runbook](./operations/v1.7-release-candidate.md) - regression, beta, staging, stable promotion, and rollback gates.
- [Auto-TSTM operations](./operations/auto-tstm-operations.md) - cached Auto-TSTM API behavior, cache health, and operational limits.
- [Auto-TSTM beta test plans](./operations/auto-tstm-beta-test-plans.md) - beta smoke plans for Auto-TSTM.
- [Custom products beta tester checklist](./operations/custom-products-beta-test-plan.md) - a short Forecast-editor test for custom layers and saved products.
- [Monitor reference-layer source research](./operations/monitor-reference-sources.md) - official short-term forecast and SPC mesoscale discussion sources.

## Current guidance: Testing

- Unit and component tests live beside the protected module under `src/` and
  use Jest with Testing Library. Keep behavior groups together, but split a
  file when unrelated concerns make failures hard to locate.
- Server tests live beside their route or service under `server/` and run with
  the analytics server test command used by CI.
- Browser workflows live under `e2e/` and exercise user-visible route,
  persistence, map, and hosted-capability behavior with Playwright.
- Run `pnpm test --runInBand <path>` for a focused unit/component change,
  `pnpm run test:e2e` for browser behavior, and the full CI build/test matrix
  before treating a cross-cutting cleanup as complete.
- Test cleanup must preserve coverage of user-visible behavior and security
  boundaries. Remove a test only with evidence that its behavior is covered
  elsewhere; do not replace workflow coverage with implementation-shaped
  assertions.

## Historical and exploratory material

These documents describe a release, experiment, or planning decision at a
specific point in time. Check the current architecture and operations guides
before using them to make a code or deployment decision.

- [v1.4.0 plan](./releases/v1.4.0-plan.md) - hosted accounts, sync, billing, and sustainability plan.
- [Timed production rollout](./operations/timed-production-rollout.md) - superseded scheduled-promotion design retained for historical context.
- [v1.3.0 notes](./releases/v1.3.0.md) - workflow polish and visibility notes.
- [v1.2.0 notes](./releases/v1.2.0-launch.md) - editing safety nets launch notes.
- [Paint-bucket investigation](./product/paint-bucket-tool-investigation.md) - product investigation and design evidence.
- [Outlook polygon masking investigation](./architecture/outlook-polygon-masking-investigation.md) - implementation research and tradeoffs.

## Product

- [Outlook information](./product/outlook-info.md) - risk levels, probability values, and categorical conversion rules.
- [Built-in specialty styles](./product/specialty-style-policy.md) - the approved relationship between visual presets and custom products.

## Current release reference

- [v1.7.0 release notes](./releases/v1.7.0.md) - v1.7 product scope, boundaries, privacy notes, and promotion evidence.

## Archive Review

- [Review-removal manifest](./archive/review-removal/README.md) - stale docs moved out of the active docs path for deletion review.

Generated inventories and the local HTML site belong under ignored
`docs/personal`; regenerate them with the commands documented in the
architecture overview.