# #914 Forecast Workspace Route, State, and Persistence Boundaries

**Parent:** #913
**Branch:** `gfc-914-shell` (worktree `C:/Users/super/projects/gfc-914-shell`, base `b25abba7`)
**Date:** 2026-09-01

## Canonical Route Structure

```
/forecast                     → Forecast shell (layout, workspace switcher)
  /forecast/severe            → Severe (existing, default)
  /forecast/mesoscale         → Mesoscale (from #919, gated)
  /forecast/custom            → Custom (from #915, gated)
  /forecast/tropical          → Tropical (future, v1.9, gated)
  /forecast/winter            → Winter (future, gated)
  /forecast/severe/:id        → Severe with cycle ID (future)
```

- Legacy `/forecast` redirects to `/forecast/severe` via `getDefaultForecastWorkspacePath()` (already exists)
- Legacy `/discussion` redirects into Severe workspace shell (handled in #916)

## Workspace Switcher Behavior

- Located in Forecast shell header (from #917, but defined here)
- Shows: Severe (always), Mesoscale (when `isFeatureExposed('mesoscale')`), Custom (when `isFeatureExposed('customProducts')`), Tropical/Winter as disabled + gated (feature flag false)
- Active state derived from `useLocation().pathname` prefix

## Production-Capable vs Gated

| Workspace | v1.8 status | Exposure key |
|-----------|-------------|--------------|
| Severe | production | `severe` (always true) |
| Mesoscale | beta/local | `mesoscale` |
| Custom | production (existing) | `customProducts` |
| Tropical | future | `tropicalWorkspace` (false) |
| Winter | future | `winterWorkspace` (false) |

## State Ownership

- **Shell state (shared):** `forecastCycle`, `currentDay`, `cycleDate`, `isSaved`, `theme`, `user`
- **Workspace-specific:** Severe holds `outlookData` (tornado/wind/hail), Mesoscale holds `mesoscaleParameters` (from #918 contract), Custom holds `customLayers`, Discussion holds `discussion` (scoped per workspace/day)
- Shell owns persistence: `localStorage` key `gfc-forecast-cycle-v2`, keyed by `cycleDate` + `workspaceId`

## Save/Load/Export/Restore

- Save: `serializeForecast(cycle, mapView, metadata)` with added `workspaceId` in `cycleMetadata`
- Load: `deserializeForecast` checks `workspaceId`, falls back to Severe if unknown
- Export: `buildWorkflowExportPackage` includes `workspaceId` per #914 contract
- Restore: `normalizeForecastCycle` migrates legacy cycles without `workspaceId` → Severe

## Implementation Slice (this PR)

- `src/config/forecastWorkspaces.ts` — route constants, workspace registry, `isWorkspaceExposed()` helper
- `docs/architecture/forecast-workspace-01.md` — this doc
- Tests: `src/config/forecastWorkspaces.test.ts` — route + exposure + persistence key

Future: #915 Custom move, #916 Discussion bundle, #919 Mesoscale MVP reuse this registry.
