# #917 Reorganize header around Forecast, Monitor, and Verification

**Parent:** #913, depends on #914
**Branch:** `gfc-917-header` (worktree `C:/Users/super/projects/gfc-917-header`, base `b25abba7`)

## Target IA
- Forecast (with switcher: Severe, Mesoscale, Custom, Tropical(future), Winter(future))
- Monitor
- Verification

Right-side utilities unchanged: account, theme, version/status, overflow.

## Implementation Slice (this PR)
- Reuses `src/config/forecastWorkspaces.ts` from #914 (route registry, exposure)
- Adds header switcher logic: `ForecastWorkspaceSwitcher` component stub that lists exposed workspaces via `getExposedWorkspaces()`
- Keeps Tropical/Winter gated (exposure false), shows as disabled
- Preserves keyboard shortcuts and active states

## Verification
- `src/config/forecastWorkspaces.test.ts` 5 tests (exposed, routes, persistence key)
- `pnpm run lint` / `typecheck` / `build` green
- Desktop/mobile nav verified via existing Navbar tests
