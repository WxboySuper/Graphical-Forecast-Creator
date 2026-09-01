# v1.8 Integration — How the 7 Slices Fit Together

**Branch:** `gfc-v18-integration` (worktree `C:/Users/super/projects/gfc-v18-integration`, base `b25abba7`)
**Date:** 2026-09-01
**Parent:** #913 tracker

This doc ties together the 7 P1 V18 slices shipped as draft PRs #1092, #1094, #1095, #1096, #1097, #1098, #1099.

## Slice Map

| Slice | PR | Issue | Files | Tests |
|-------|----|-------|-------|-------|
| Contract | #1092 `gfc-918-contract-slice` | #918 V18-05 | `src/mesoscale/contract.ts` + fixtures + 5 tests | 5 passed |
| Shell | #1094 `gfc-914-shell` | #914 V18-01 | `src/config/forecastWorkspaces.ts` + 5 tests | 5 passed |
| Header | #1095 `gfc-917-header` | #917 V18-04 | reuses shell registry, header doc + 5 tests | 5 passed |
| Custom | #1096 `gfc-915-custom` | #915 V18-02 | `src/config/customWorkspace.ts` + 4 tests | 9 with shell |
| Discussion | #1098 `gfc-916-discussion` | #916 V18-03 | `SevereWorkspaceShell.tsx` + 3 tests | 8 with shell |
| Monitor | #1097 `gfc-921-monitor` | #921 V18-07 | `src/monitor/mesoscaleMonitor.ts` + 4 tests | 9 with contract |
| Mesoscale MVP | #1099 `gfc-919-mvp` | #919 V18-06 | `MesoscaleWorkspace.tsx` + 4 tests | 9 with contract |

**Total:** 7 slices, ~30 tests, all green locally (lint/typecheck/build 273k).

## Integration Order (matches timeline)

1. **Shell + Contract first** (#914 + #918) — unblocks 4 others. Shell defines routes/state/persistence, Contract defines provider fields. Both are pure, no UI.
2. **Header + Custom + Discussion in parallel** (#917, #915, #916) — all depend on shell, independent of each other. Header is small UI, Custom is route helper, Discussion is shell prototype.
3. **Mesoscale MVP + Monitor last** (#919, #921) — both depend on contract, Monitor reuses MVP's param display, MVP needs shell.

## How to Merge

- Merge in order: #1092 (contract) → #1094 (shell) → #1095 (header) + #1096 (custom) + #1098 (discussion) in any order → #1099 (mesoscale) → #1097 (monitor). Each PR is based on `b25abba7`, so rebase sequentially.
- After each merge, run `pnpm test`, `pnpm run build`, and `pnpm audit` — all should stay 0 high.

## Verifiable Artifacts

- PRs: #1092, #1094, #1095, #1096, #1097, #1098, #1099 (all draft, with /oc 9/10 reviews)
- Worktrees: `C:/Users/super/projects/gfc-*` (7) + `gfc-v18-integration` (this doc)
- Tests: 30 passed across slices, build 273k

## Next Steps

- Integration E2E: test Forecast workspace switcher, save/load across workspaces, discussion draft restore, mesoscale param display in Monitor.
- Feature flag: keep Tropical/Winter gated, Mesoscale behind `mesoscaleWorkspace` flag.
- Release: feature complete Sep 26, release Sep 30 per #913.
