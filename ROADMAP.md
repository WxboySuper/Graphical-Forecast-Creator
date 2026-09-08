# GFC roadmap

This file records the product direction that is current enough to guide work. It
is not a release checklist and it does not replace the architecture and
operations guides in [`docs/README.md`](docs/README.md).

## Current status

GFC is a browser application for creating, discussing, monitoring, and
verifying graphical weather forecasts. The current product includes the
Forecast, Discussion, Monitor, and Verification surfaces, with account,
billing, cloud-cycle, custom-product, and telemetry capabilities governed by
the feature-exposure policy.

The current architecture and ownership map live in
[`docs/architecture/codebase-inventory.md`](docs/architecture/codebase-inventory.md).
Use the release workflow and operations guides for deploy and support work.

## Shipped milestones

The historical version sections in the original roadmap became a second,
stale changelog. The maintained release record is [`CHANGELOG.md`](CHANGELOG.md),
so this roadmap keeps only the milestones that explain the product's present
shape:

- The Outlook Creator established the forecast map, outlook categories, cycles,
  save and load behavior, discussion editing, exports, and verification.
- Workflow reliability work added safer editing, undo and redo behavior,
  cycle history, and stronger map and export boundaries.
- The v1.4 and v1.7 work added hosted accounts, billing, cloud cycles, feature
  exposure controls, beta operations, and release safeguards.
- The current v1.8 direction is to keep forecast workspace state independent,
  make persistence ownership explicit, and document the route, state, export,
  and exposure boundaries before adding more product surface.

## Active direction

When choosing the next change, prefer work that improves one of these areas:

- forecast workspace reliability and data ownership;
- verification quality and explainable grading;
- monitor data freshness, source boundaries, and failure handling;
- accessible workflow and mobile support where the product already promises it;
- clear feature exposure, entitlement, and privacy behavior.

Each change should have a focused issue, a small reviewable pull request, and
tests at the user-visible or security boundary it affects. Update the relevant
architecture or operations document when a boundary changes.

## Future ideas

WarnGen simulation, educational warning generation, historical scenario replay,
and a WxSim game remain ideas. They have no committed release date or active
implementation contract. Create a product decision and architecture note before
starting work on any of them.