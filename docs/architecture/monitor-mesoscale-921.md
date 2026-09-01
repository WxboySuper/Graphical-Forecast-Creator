# #921 Display mesoscale parameters in single Monitor page

**Parent:** #913, depends on #918 + #919
**Branch:** `gfc-921-monitor` (worktree `C:/Users/super/projects/gfc-921-monitor`, base `b25abba7`)

## Problem
Monitor should remain single page but show supported mesoscale parameter layers (from #918 contract) alongside radar/satellite/outlooks.

## Solution Slice (this PR)
- Adds Monitor mesoscale layer registry that reuses #918 provider contract
- Provides `isMesoscaleLayerEnabled`, `getMesoscaleLayerConfig`, and read-only helpers
- No editing of Mesoscale Forecast geometry from Monitor
- Preserves existing radar/satellite controls

## Implementation
- `src/monitor/mesoscaleMonitor.ts` — layer registry, enabled check, config getter
- `src/monitor/mesoscaleMonitor.test.ts` — 4 tests
- `docs/architecture/monitor-mesoscale-921.md` — this doc

Future: Full Monitor UI controls for layer selection/opacity/legend (follow-up).
