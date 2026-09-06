# GFC codebase audit implementation handoff

Updated September 6, 2026. The user asked the Astra run to finish the audit and document the remaining fixes and PRs for another model. Stop this run after publishing and checking the documentation. The overall cleanup is not complete.

## Start here

Read [the audit report](2026-09-05-codebase-audit.md) and [tracker issue #1109](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1109). The report records 37 findings, their affected files, evidence, proposed fixes, and acceptance checks. The original audit indexed all 1,079 tracked files at baseline `32c2ccc0d532a227eed83232401fa89d5bb04a22`. Structural review covered every repository area; behavioral review focused on the systems described in the report. This does not prove every line is correct or exhaust every possible future finding.

The original 34 issues were opened before fixes. SA-35 through SA-37 were discovered during cleanup and documented before their fixes. Fifteen implementation PRs and the audit documentation PR are published. All 16 had green checks when inspected before the final documentation update. No audit PR has been merged. Do not interpret an open issue as evidence that its PR was never written, or green checks as a substitute for its acceptance criteria.

The latest user instruction takes precedence over older PR-writing defaults:

> When opening or maintaining a pull request you always first off wait for checks and verify that they are green. Also when opening a pull request your pull request descriptions should always be detailed. Explain in detail what you did, why you did it, and what impact it has on the codebase/application (if applicable). It's encouraged to be detailed, and reference specific code/lines of code in your explanation.

Wait for all checks after each PR update and verify green before advancing to another PR. Expand older short descriptions when maintaining those PRs. Use `gh` for all GitHub operations and `gh stack` for dependent PRs. Do not merge unless the user authorizes merging. Core forecasting remains free. Preserve consent, account isolation, import compatibility, and meteorological behavior during cleanup. Apply the unslop skill to authored text.

## Workspace and branches

The implementation worktree is:

```text
C:\Users\super\Projects\Graphical-Forecast-Creator\docs\personal\gfc-slop-audit
```

It was moved from `C:\Users\super\Projects\gfc-slop-audit`. Use the current path for every command. Do not modify or reset the original project checkout or other worktrees. The last worktree inventory showed the original checkout on `main` at `b7f7ba5a`; it is older than the audit baseline. Reinspect current state before relying on branch names or commit IDs.

The final checkout should be `codex/audit-shared-map-styles`, with the unpublished SA-16 work preserved. Its commits at handoff are `42f16db8` and `b31a5ae0`, based on export PR head `e0204338`. The audit report and this document live on separate branch `audit/slop-2026-09-05` in PR #1144. They may not exist as tracked files on the implementation branch. A local copy of this handoff is also saved at `docs/personal/GFC-SLOP-AUDIT-HANDOFF.md` in the original project and in the audit worktree.

Inspect `git status`, branch history, and GitHub heads first. The export PR received additional commits during this run. They were fetched and incorporated into SA-16 rather than overwritten. Those commits group capture arguments, address code-quality findings, and are green on GitHub.

Published stacks, in dependency order:

- Infrastructure, stack #1149: #1145, #1146, #1147, #1148, #1150. The first PR targets `main`.
- Cleanup, stack #1153: #1151, #1152, #1154, #1156, #1157, #1158, #1159, #1160, #1161, #1163. The first PR targets `main`.
- Documentation: independent PR #1144 against `main`.
- SA-16: local branch `codex/audit-shared-map-styles`, registered as the next cleanup stack branch. No PR or remote branch was intentionally published for it.

Use `gh stack view` to inspect current metadata. To add a branch, check out the current stack branch and run `gh stack add codex/name`; running `git switch -c` first makes the new branch unknown to the stack. The local `main` is stale, so prior dependent rebases used `gh stack rebase --no-trunk`. Do not reset the user's `main` to make a stack command work. Await the completion of stack operations before switching branches.

## SA-16 is implemented locally, but is not ready to call complete

The branch removes approximately 300 lines of duplicate verification helpers. `OpenLayersVerificationMap.tsx` now uses the existing `openLayersMapStyles.ts` helpers for tile and label sources, layer replacement, color conversion, fill-opacity defaults, stroke-width defaults, and z-index constants. Hatch drawing has explicit stroke color and width options.

Verification keeps its intended differences: fill opacity is capped at 0.42, missing fill color defaults to gray, hatch strokes use `#111111` at width 1.1, CIG outline width stays 1.2, and CIG ranks remain above normal probabilities. Forecast defaults remain unchanged. Tiny verification-only coercion and wrapper helpers were removed. The remaining verification `buildStyle` assembles the policy directly.

Validation completed before handoff:

- Four focused map suites passed, 41 tests. Tests assert actual verification fill opacity, stroke values, CIG rank, missing canvas behavior, and configurable hatch drawing instead of only checking that an object exists.
- Application and tooling typechecks passed. Targeted ESLint passed before the last test-only setup correction.
- Production build passed. A development-mode build also passed for browser validation.
- The new `e2e/map-style-compatibility.spec.ts` passed in Chromium. It starts a Day 1 workflow with the development premium test account, draws wind 15%, exports a package, uploads that package into Forecast Grade, selects wind and the blank basemap, and captures light/dark screenshots.
- The screenshots were inspected. The forecast is opaque and verification translucent as intended. The test does not automatically assert polygon pixels or hatch appearance; those aspects rely on style unit tests and visual inspection.

The browser test initially failed because it tried to export a workflow without starting one, then because a production build does not enable the development test account. The final test uses `/?localTestAccount=premium`; local browser validation used `vite build --mode development` followed by preview. Existing CI uses the development server, where that account is supported. Do not describe the earlier failed runs as application regressions.

Next model should inspect the final diff, run lint for the final test, and review shared-style semantics before opening a detailed PR against `codex/audit-remove-leaflet`. Then wait for every check and resolve failures. No CI result exists for SA-16 yet. Do not claim it is a published or green PR.

## Remaining implementation work

SA-17 through SA-37 have no implementation PRs. Their acceptance checks are in the audit report and issues. Recheck evidence against the branch you choose before editing. Several corrections matter:

- SA-13 originally proposed one workspace registry. Neither registry had real application consumers beyond a helper returning `/forecast/severe`. PR #1160 removes both and preserves the actual `featureSurfaces` / `buildFeatureGatedRoutes` registration. No storage migration is required; the removed key helper had no callers. The report and issue now reflect this.
- SA-35 concerns obsolete layout resolution. Only the tabbed toolbar is live. All four historical values already render it. Remove redundant query/storage/preference resolution while preserving auth/profile schema compatibility. PR #1156 added browser coverage for the legacy query values.
- SA-17 is more than duplicated code. Both maps only increment their style request counter inside the vector-style branch. A pending vector result can therefore outlive a switch to blank/raster or unmount. The shared loader needs cleanup on effect replacement and unmount, plus disposal of abandoned groups. Test delayed success and failure, fast switching, and partially failed `apply` calls. Read `ol-mapbox-style` and OpenLayers ownership behavior before disposing transferred layers.
- SA-20, SA-21, SA-23, and SA-34 need deferred-request tests. Normal synchronous mocks will miss stale completion, overlapping refresh, and selection/account changes.
- SA-28 changes reducer determinism and undo behavior. Audit the correct day snapshot and async land-mask completion when the active cycle changes. Do not simply wrap the existing cache read.
- SA-30 is substantial. The baseline allowed 182 test TypeScript errors and currently reported 158. Removed dead tests will change that count. Fix groups in focused PRs, then remove the allowance. Do not raise it or suppress errors to make CI green.
- SA-31 needs a reproducible CSS build and visual verification. The checked-in utility snapshot, installed Tailwind version, PostCSS setup, and compatibility config disagree. Choose a pipeline that preserves the current UI; do not casually migrate the design to Tailwind 4.
- SA-36 concerns generated image exports. The unofficial badge overlaps the export timestamp/attribution footer at the normal desktop viewport in both themes. Preserve the warning and attribution while reserving distinct space, including narrow exports.
- SA-37 concerns the live verification map. Its telemetry strip overlaps the unofficial badge in the narrow desktop map column in both themes. This is separate from export footer placement. Consider putting telemetry in the existing toolbar instead of adding another independently positioned overlay.

The next model may split a large issue into several focused PRs. Create a new issue before fixing a new finding. A green PR does not justify deleting a required live feature or its tests.

## Validation and local tooling

Use the pinned pnpm 10.30.3. Plain `pnpm` resolved to a bundled version 11 in this environment. Dependency junctions were repaired after the worktree move with a forced frozen install; avoid reinstalling unless needed. Root dependencies use pnpm, server dependencies use npm.

Useful commands from the audit worktree:

```powershell
npx --yes pnpm@10.30.3 install --frozen-lockfile
node node_modules/@typescript/native/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/@typescript/native/bin/tsc --noEmit -p tsconfig.node.json
node node_modules/jest/bin/jest.js --maxWorkers=2
node node_modules/vite/bin/vite.js build
```

The repository's `tsc` path uses native TypeScript. The `typescript` dependency aliases TypeScript 6, whose executable is named `tsc6`; do not assume the package's usual CLI path. Read package scripts for server, tooling, license, and feature-policy checks on the branch being validated.

For local browser tests that need the development account:

```powershell
node node_modules/vite/bin/vite.js build --mode development
$env:PLAYWRIGHT_WEBSERVER_COMMAND = 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 3000'
node node_modules/@playwright/test/cli.js test e2e/map-style-compatibility.spec.ts --workers=1
```

Cold Vite development-server compilation sometimes exceeded the existing 10-second route timeout locally. Preview avoids that startup issue. The backend is not running at port 3006; browser logs may contain expected connection errors for billing configuration. Do not add broad network-error suppressions. `build` currently contains the development-mode validation build and is ignored.

Git/network operations required approved escalation in the sandbox. Read-only Git can use the task-specific `safe.directory` option for the audit path. `rg` was unavailable to the sandbox through its WinGet link; `git grep` under the approved shell worked. Use native PowerShell paths and file operations. Never operate on another worktree by accident.

CI includes Node 22/24/26 builds and tests, lint, typechecks, license/dependency checks, feature policy, Firestore rules, browser tests, CodeQL, DeepSource, CodeScene, and Socket. Inspect the entire `statusCheckRollup`; empty conclusions may mean queued/running. Successful checks plus explicitly skipped or neutral checks were treated as green. A PR description update can rerun governance. Check again after the final update.

DeepSource sometimes reports pre-existing problems elsewhere in an edited file. Its public report shows findings that GitHub cannot display inline. Read the actual report and fix the specific issue; do not blindly add suppression comments. The routing PR required declaration reordering and meaningful function comments. The export PR required grouping capture arguments and documenting helpers. All those published checks are green at the snapshot.

## Evidence files

The ignored directory `docs/personal/slop-audit/` inside the audit worktree contains:

- `findings.json`, `github.json`, and `implementation-prs.json`, updated through SA-37 and implementation SA-15.
- `inventory.json`, `graph.json`, `duplicates.json`, and `file-ledger.json` for the original audit. These are baseline evidence, not a claim that the post-cleanup tree has the same counts.
- `tracker.md` and the PR body files. Early `publish.mjs` is stale and must not be rerun blindly; it contained an incorrect four-layout assumption and derives its baseline from the checkout.
- `SA-15-full-jest.log`, recording 217 suites and 1,322 passing tests after Leaflet removal. The later GitHub export commits also passed CI.
- `SA-16-jest.log`, `SA-16-build.log`, `SA-16-dev-build.log`, and `SA-16-browser.log` for the local map-style branch.
- `export-evidence/forecast-light.jpg` and `forecast-dark.jpg` for SA-36.
- `map-style-evidence/forecast-style.png`, `verification-style.png`, and `verification-dark-style.png` for SA-16 and SA-37.

The full-suite test count falls as unreachable modules and exclusive tests are removed. That reduction alone is not evidence of improved coverage. The focused tests and browser checks document preserved live behavior.

## Finding-to-PR status

The table is a September 6 snapshot. Recheck GitHub before continuing. Issues remain open until their fixes merge.

| Finding | Issue | Implementation at handoff |
| --- | --- | --- |
| SA-01 | [#1110](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1110) Discover all server tests instead of maintaining a filename list | [#1145](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1145), green, unmerged |
| SA-02 | [#1111](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1111) Run all script tests in CI and remove duplicate Jest coverage runs | [#1146](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1146), green, unmerged |
| SA-03 | [#1112](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1112) Add the existing Auto-TSTM Python tests to CI | [#1148](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1148), green, unmerged |
| SA-04 | [#1113](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1113) Separate production bundle verification from ordinary Jest tests | [#1150](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1150), green, unmerged |
| SA-05 | [#1114](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1114) Preserve vendored boundary checksums across Windows checkouts | [#1147](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1147), green, unmerged |
| SA-06 | [#1115](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1115) Remove the package command for the deleted beta changelog script | [#1151](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1151), green, unmerged |
| SA-07 | [#1116](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1116) Separate development dependencies from shipped application dependencies | [#1152](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1152), green, unmerged |
| SA-08 | [#1117](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1117) Remove unused Create React App bootstrap artifacts | [#1154](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1154), green, unmerged |
| SA-09 | [#1118](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1118) Remove retired day, outlook, toolbar, and drawing control implementations | [#1156](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1156), green, unmerged |
| SA-10 | [#1119](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1119) Remove the disconnected legacy discussion editor | [#1157](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1157), green, unmerged |
| SA-11 | [#1120](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1120) Remove obsolete map controls and the unused React alert popup | [#1158](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1158), green, unmerged |
| SA-12 | [#1121](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1121) Remove disconnected workflow serialization and analytics compatibility layers | [#1159](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1159), green, unmerged |
| SA-13 | [#1122](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1122) Remove unused forecast workspace registries | [#1160](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1160), green, unmerged |
| SA-14 | [#1123](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1123) Resolve the disconnected verification share-card implementation | [#1161](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1161), green, unmerged |
| SA-15 | [#1124](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1124) Remove the Leaflet export fallback after the OpenLayers migration | [#1163](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1163), green, unmerged |
| SA-16 | [#1125](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1125) Share forecast and verification map style helpers | Local branch only; no PR |
| SA-17 | [#1126](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1126) Share asynchronous basemap style loading and cleanup | Not started |
| SA-18 | [#1127](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1127) Use one blob download helper | Not started |
| SA-19 | [#1128](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1128) Share custom-product validation primitives | Not started |
| SA-20 | [#1129](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1129) Stop stale and overlapping Monitor alert refreshes | Not started |
| SA-21 | [#1130](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1130) Connect alert-banner validation and scheduling to the live hook | Not started |
| SA-22 | [#1131](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1131) Reject invalid timestamps when choosing autosave snapshots | Not started |
| SA-23 | [#1132](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1132) Bound queued analytics events and clean up failed tracker scripts | Not started |
| SA-24 | [#1133](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1133) Share duplicate server Firebase bearer-token verification | Not started |
| SA-25 | [#1134](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1134) Consolidate duplicate legacy analytics viewer commands | Not started |
| SA-26 | [#1135](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1135) Remove the expired March 2026 launch countdown and gate | Not started |
| SA-27 | [#1136](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1136) Reuse local-date helpers for workflow suggestions and Home | Not started |
| SA-28 | [#1137](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1137) Make outlook trimming independent of the global land-mask cache | Not started |
| SA-29 | [#1138](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1138) Keep modal focus stable when the close callback changes | Not started |
| SA-30 | [#1139](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1139) Eliminate the permitted test TypeScript errors | Not started |
| SA-31 | [#1140](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1140) Restore reproducible utility CSS generation | Not started |
| SA-32 | [#1141](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1141) Count premium subscriptions without fetching every entitlement document | Not started |
| SA-33 | [#1142](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1142) Remove duplicated local sign-in and sign-up orchestration | Not started |
| SA-34 | [#1143](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1143) Scope cloud sync completion to the selected cycle | Not started |
| SA-35 | [#1155](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1155) Remove obsolete forecast layout preference resolution | Not started |
| SA-36 | [#1162](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1162) Prevent exported footer and unofficial badge from overlapping | Not started |
| SA-37 | [#1164](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1164) Prevent verification telemetry from overlapping the unofficial badge | Not started |
