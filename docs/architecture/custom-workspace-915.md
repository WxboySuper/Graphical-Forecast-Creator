# #915 Move Custom products into Forecast > Custom workspace

**Parent:** #913, depends on #914
**Branch:** `gfc-915-custom` (worktree `C:/Users/super/projects/gfc-915-custom`, base `b25abba7`)

## Problem
Custom product editing currently appears inside main Forecast experience. New model needs dedicated Forecast > Custom workspace so Severe/Mesoscale remain focused while existing custom layers, premium, imports/exports, snapshots continue.

## Solution Slice (this PR)
- Adds Forecast > Custom workspace route (`/forecast/custom`) via `forecastWorkspaces` registry (from #914)
- Preserves existing custom layer/category state in saved cycles (no migration yet, just route)
- Preserves premium entitlement checks via existing `isFeatureExposed('customProducts')`
- Defines reference from Monitor: `getCustomWorkspaceRoute()` helper

## Implementation
- `src/config/customWorkspace.ts` — route helper, isCustomWorkspaceExposed
- `src/config/customWorkspace.test.ts` — 4 tests
- `docs/architecture/custom-workspace-915.md` — this doc

Future: Full move of editing controls out of Severe surface, migration for saved cycles with custom layers (#915 full).

## Verification
- pnpm test src/config/customWorkspace.test.ts: 4 passed
- lint/typecheck/build green
- Existing custom-product tests still pass (no state change in this slice)
