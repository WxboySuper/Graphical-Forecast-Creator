# #916 Bundle Discussion into Severe Forecast workspace

**Parent:** #913, depends on #914
**Branch:** `gfc-916-discussion` (worktree `C:/Users/super/projects/gfc-916-discussion`, base `b25abba7`)

## Problem
Discussion is currently top-level, but should be part of Severe Forecast workspace (map + discussion + review/export as one workflow).

## Solution Slice (this PR)
- Prototypes Severe Forecast shell with Map, Discussion, Review/Export surfaces
- Preserves guided and DIY modes via existing DiscussionEditor
- Defines backward-compatible redirect from `/discussion` → `/forecast/severe`

## Implementation
- `src/components/ForecastWorkspace/SevereWorkspaceShell.tsx` — shell with 3 surfaces, props for mapView, discussion, onSave
- `src/components/ForecastWorkspace/SevereWorkspaceShell.test.tsx` — 3 tests (renders surfaces, discussion modes, redirect)
- Reuses `src/config/forecastWorkspaces.ts` from #914

Future: Full migration of discussion editor, draft restore, day switching, responsive.
