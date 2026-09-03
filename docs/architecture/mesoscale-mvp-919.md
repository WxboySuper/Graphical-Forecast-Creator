# #919 Build Mesoscale Forecast workspace MVP

**Parent:** #913, depends on #914 + #918
**Branch:** `gfc-919-mvp` (worktree `C:/Users/super/projects/gfc-919-mvp`, base `b25abba7`)

## Problem
GFC needs dedicated Mesoscale Forecast workspace (forecast product with map, model context, parameter display, forecast area, discussion) — not just Monitor layer.

## Solution Slice (this PR)
- Adds Mesoscale workspace route via forecastWorkspaces registry
- Provides cloud-supplied model layers using #918 contract (CAPE, STP, etc.)
- Displays radar/satellite context placeholder, parameter legends, model/cycle metadata
- Provides forecast-area placeholder and discussion surface

## Implementation
- `src/components/MesoscaleWorkspace/MesoscaleWorkspace.tsx` — workspace with map, param display, forecast area, discussion, attribution
- `src/components/MesoscaleWorkspace/MesoscaleWorkspace.test.tsx` — 4 tests (renders, param display, empty/stale states, attribution)
- Reuses `src/mesoscale/contract.ts` from #918

Future: Full drawing workflow, save/load, export, radar integration.
