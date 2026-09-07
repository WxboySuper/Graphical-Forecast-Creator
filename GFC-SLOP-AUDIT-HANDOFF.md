# GFC codebase audit implementation handoff

Updated September 7, 2026. The user asked the Astra run to finish the audit and document the remaining fixes and PRs for another model. Stop this run after publishing and checking the documentation. The overall cleanup is not complete.

## Start here

Read [the audit report](2026-09-05-codebase-audit.md) and [tracker issue #1109](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1109). The original report records the baseline findings, their affected files, evidence, proposed fixes, and acceptance checks. This handoff extends that record through SA-72. The original audit indexed all 1,079 tracked files at baseline `32c2ccc0d532a227eed83232401fa89d5bb04a22`. Structural review covered every repository area; behavioral review focused on the systems described in the report. This does not prove every line is correct or exhaust every possible future finding.

The original 34 issues were opened before fixes. SA-35 through SA-72 were discovered during cleanup and documented before their fixes. Seventy-two implementation/documentation findings are now documented, and implementation PRs through SA-72 (#1266) are published. All completed PRs through #1265 have green checks at their recorded heads, including the supplied DeepSource follow-up on SA-34 and the Playwright follow-up on SA-38. No audit PR has been merged. Do not interpret an open issue as evidence that its PR was never written, or green checks as a substitute for its acceptance criteria.

The latest user instruction takes precedence over older PR-writing defaults:

> When opening or maintaining a pull request you always first off wait for checks and verify that they are green. Also when opening a pull request your pull request descriptions should always be detailed. Explain in detail what you did, why you did it, and what impact it has on the codebase/application (if applicable). It's encouraged to be detailed, and reference specific code/lines of code in your explanation.

Wait for all checks after each PR update and verify green before advancing to another PR. Expand older short descriptions when maintaining those PRs. Use `gh` for all GitHub operations and `gh stack` for dependent PRs. Do not merge unless the user authorizes merging. Core forecasting remains free. Preserve consent, account isolation, import compatibility, and meteorological behavior during cleanup. Apply the unslop skill to authored text.

## Workspace and branches

The implementation worktree is:

```text
C:\Users\super\Projects\Graphical-Forecast-Creator\docs\personal\gfc-slop-audit
```

It was moved from `C:\Users\super\Projects\gfc-slop-audit`. Use the current path for every command. Do not modify or reset the original project checkout or other worktrees. The last worktree inventory showed the original checkout on `main` at `b7f7ba5a`; it is older than the audit baseline. Reinspect current state before relying on branch names or commit IDs.

The current implementation checkout is `codex/extract-openlayers-reconciliation`, the SA-66 branch stacked on PR #1264. PRs #1183 through #1266 are green and unmerged. Earlier cleanup branches and PRs remain published and unmerged.

Published stacks, in dependency order:

- Infrastructure, stack #1149: #1145, #1146, #1147, #1148, #1150. The first PR targets `main`.
- Cleanup, stack #1153: #1151, #1152, #1154, #1156, #1157, #1158, #1159, #1160, #1161, #1163. The first PR targets `main`.
- Documentation: independent PR #1144 against `main`.
- SA-16: local branch `codex/audit-shared-map-styles`, registered as the next cleanup stack branch. No PR or remote branch was intentionally published for it.

Use `gh stack view` to inspect current metadata. To add a branch, check out the current stack branch and run `gh stack add codex/name`; running `git switch -c` first makes the new branch unknown to the stack. The local `main` is stale, so prior dependent rebases used `gh stack rebase --no-trunk`. Do not reset the user's `main` to make a stack command work. Await the completion of stack operations before switching branches.

## SA-16 through SA-18 are implemented on published cleanup branches

The branch removes approximately 300 lines of duplicate verification helpers. `OpenLayersVerificationMap.tsx` now uses the existing `openLayersMapStyles.ts` helpers for tile and label sources, layer replacement, color conversion, fill-opacity defaults, stroke-width defaults, and z-index constants. Hatch drawing has explicit stroke color and width options.

Verification keeps its intended differences: fill opacity is capped at 0.42, missing fill color defaults to gray, hatch strokes use `#111111` at width 1.1, CIG outline width stays 1.2, and CIG ranks remain above normal probabilities. Forecast defaults remain unchanged. Tiny verification-only coercion and wrapper helpers were removed. The remaining verification `buildStyle` assembles the policy directly.

Validation completed before handoff:

- Four focused map suites passed, 41 tests. Tests assert actual verification fill opacity, stroke values, CIG rank, missing canvas behavior, and configurable hatch drawing instead of only checking that an object exists.
- Application and tooling typechecks passed. Targeted ESLint passed before the last test-only setup correction.
- Production build passed. A development-mode build also passed for browser validation.
- The new `e2e/map-style-compatibility.spec.ts` passed in Chromium. It starts a Day 1 workflow with the development premium test account, draws wind 15%, exports a package, uploads that package into Forecast Grade, selects wind and the blank basemap, and captures light/dark screenshots.
- The screenshots were inspected. The forecast is opaque and verification translucent as intended. The test does not automatically assert polygon pixels or hatch appearance; those aspects rely on style unit tests and visual inspection.

The browser test initially failed because it tried to export a workflow without starting one, then because a production build does not enable the development test account. The final test uses `/?localTestAccount=premium`; local browser validation used `vite build --mode development` followed by preview. Existing CI uses the development server, where that account is supported. Do not describe the earlier failed runs as application regressions.

SA-16 is published as PR #1165 (`codex/audit-shared-map-styles`) and all checks are green. SA-17 is published as PR #1166 (`codex/audit-openfreemap-loader`) and all checks are green. SA-18 is published as PR #1167 (`codex/audit-blob-download-helper`) and all required checks are green, including E2E, CodeScene, DeepSource, governance, lint, typecheck, dependency, policy, Socket, and Node 22/24/26 build/test matrices.

## Remaining implementation work

SA-35 through SA-56 have implementation PRs. Their acceptance checks are in the audit report and issues. Recheck evidence against the branch you choose before editing. Several corrections matter:

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
| SA-16 | [#1125](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1125) Share forecast and verification map style helpers | [#1165](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1165), green, unmerged |
| SA-17 | [#1126](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1126) Share asynchronous basemap style loading and cleanup | [#1166](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1166), green, unmerged |
| SA-18 | [#1127](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1127) Use one blob download helper | [#1167](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1167), green, unmerged |
| SA-19 | [#1128](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1128) Share custom-product validation primitives | [#1168](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1168), green, unmerged |
| SA-20 | [#1129](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1129) Stop stale and overlapping Monitor alert refreshes | [#1169](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1169), green, unmerged |
| SA-21 | [#1130](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1130) Connect alert-banner validation and scheduling to the live hook | [#1170](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1170), green, unmerged |
| SA-22 | [#1131](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1131) Reject invalid timestamps when choosing autosave snapshots | [#1171](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1171), green, unmerged |
| SA-23 | [#1132](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1132) Bound queued analytics events and clean up failed tracker scripts | [#1172](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1172), green, unmerged |
| SA-24 | [#1133](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1133) Share duplicate server Firebase bearer-token verification | [#1173](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1173), green, unmerged |
| SA-25 | [#1134](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1134) Consolidate duplicate legacy analytics viewer commands | [#1174](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1174), green, unmerged |
| SA-26 | [#1135](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1135) Remove the expired March 2026 launch countdown and gate | [#1175](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1175), green, unmerged |
| SA-27 | [#1136](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1136) Reuse local-date helpers for workflow suggestions and Home | [#1176](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1176), green, unmerged |
| SA-28 | [#1137](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1137) Make outlook trimming independent of the global land-mask cache | [#1177](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1177), green, unmerged |
| SA-29 | [#1138](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1138) Keep modal focus stable when the close callback changes | [#1178](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1178), green, unmerged |
| SA-30 | [#1139](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1139) Eliminate the permitted test TypeScript errors | [#1179](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1179), green, unmerged |
| SA-31 | [#1140](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1140) Restore reproducible utility CSS generation | [#1180](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1180), green, unmerged |
| SA-32 | [#1141](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1141) Count premium subscriptions without fetching every entitlement document | [#1181](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1181), green, unmerged |
| SA-33 | [#1142](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1142) Remove duplicated local sign-in and sign-up orchestration | [#1182](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1182), green, unmerged |
| SA-34 | [#1143](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1143) Scope cloud sync completion to the selected cycle | [#1183](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1183), green after DeepSource fixes, unmerged |
| SA-35 | [#1155](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1155) Remove obsolete forecast layout preference resolution | [#1184](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1184), green, unmerged |
| SA-36 | [#1162](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1162) Prevent exported footer and unofficial badge from overlapping | [#1185](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1185), green, unmerged |
| SA-37 | [#1164](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1164) Prevent verification telemetry from overlapping the unofficial badge | [#1186](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1186), green, unmerged |
| SA-38 | [#1187](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1187) Remove duplicate root start script | [#1188](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1188), green, unmerged |
| SA-39 | [#1189](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1189) Remove orphaned v1.6 update content and assets | [#1190](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1190), green, unmerged |
| SA-40 | [#1191](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1191) Remove obsolete forecast UI variant resolver | [#1192](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1192), green, unmerged |
| SA-41 | [#1193](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1193) Remove unused server capability API alias and resolve DeepSource findings | [#1194](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1194), green, unmerged |
| SA-42 | [#1195](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1195) Remove unused monitor WMS compatibility exports | [#1196](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1196), green, unmerged |
| SA-43 | [#1197](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1197) Remove unused KML download wrapper | [#1198](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1198), green, unmerged |
| SA-44 | [#1199](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1199) Remove unused cloud cycle change detector | [#1200](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1200), green, unmerged |
| SA-45 | [#1201](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1201) Remove unused verification neighborhood kilometer constant | [#1202](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1202), green, unmerged |
| SA-46 | [#1203](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1203) Remove unused outlook masking preview alias | [#1204](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1204), green, unmerged |
| SA-47 | [#1205](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1205) Remove deprecated unused cloud load modal | [#1206](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1206), green, unmerged |
| SA-48 | [#1207](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1207) Remove unreferenced legacy integrated toolbar | [#1208](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1208), green, unmerged |
| SA-49 | [#1209](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1209) Remove inert disabled feature registry entries | [#1210](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1210), green, unmerged |
| SA-50 | [#1211](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1211) Move prototype land-mask benchmark out of production source | [#1212](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1212), green, unmerged |
| SA-51 | [#1213](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1213) Move benchmark helpers into test utilities | [#1214](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1214), green, unmerged |
| SA-52 | [#1215](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1215) Share duplicate GitHub API request helper | [#1216](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1216), green, unmerged |
| SA-53 | [#1217](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1217) Share duplicated map basemap orchestration | [#1218](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1218), green, unmerged |
| SA-54 | [#1219](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1219) Share duplicated raster basemap setup | [#1220](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1220), green, unmerged |
| SA-55 | [#1221](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1221) Remove duplicate beta and production deployment config | [#1222](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1222), green, unmerged |
| SA-56 | [#1223](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1223) Graduate release-approved workstream exposure metadata | [#1224](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1224), green, unmerged |
| SA-57 | [#1225](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1225) Graduate completed Auto-TSTM lifecycle metadata | [#1226](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1226), green, unmerged |
| SA-58 | [#1227](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1227) Remove unused deprecated port parser alias | [#1228](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1228), green, unmerged |
| SA-59 | [#1229](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1229) Remove unused deprecated MANAGED_LABELS export | [#1230](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1230), green, unmerged |
| SA-60 | [#1231](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1231) Remove unreferenced branch and changelog helpers | [#1232](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1232), green, unmerged |
| SA-61 | [#1233](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1233) Consolidate remaining duplicate TypeScript imports | [#1234](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1234), green, unmerged |
| SA-62 | [#1235](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1235) Consolidate remaining map and monitor duplicate imports | [#1236](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1236), green, unmerged |
| SA-63 | [#1237](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1237) Consolidate utility, hook, and store duplicate imports | [#1238](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1238), green, unmerged |
| SA-64 | [#1239](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1239) Remove final duplicate imports from instrumentation and tests | [#1240](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1240), green, unmerged |
| SA-65 | [#1241](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1241) Document and consolidate deferred utility helpers | [#1242](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1242), green, unmerged |
| SA-66 | [#1243](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1243) Decompose oversized OpenLayers forecast map module | [#1260](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1260), [#1261](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1261), and [#1262](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1262), and [#1263](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1263), and [#1264](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1264), and [#1265](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1265), and [#1266](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1266), green, unmerged; preview synchronizers, paint-bucket policy, click handlers, utility helpers, feature-edit handlers, view synchronization, draw handling, forecast source reconciliation, and shared descriptor appliers extracted, map lifecycle and remaining feature construction remain |
| SA-67 | [#1244](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1244) Decompose oversized forecast slice module | Not implemented; issue documented for next focused PR |
| SA-68 | [#1245](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1245) Decompose oversized AuthProvider module | [#1250](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1250), [#1251](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1251), and [#1252](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1252), green, unmerged; settings/profile, hosted-sync, and local transport helpers extracted, local-auth actions and provider lifecycle follow-ups remain |
| SA-69 | [#1246](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1246) Decompose oversized AccountPage module | [#1253](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1253), green, unmerged; display and entitlement helpers extracted, billing/deletion/auth sections remain |
| SA-70 | [#1247](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1247) Decompose oversized IntegratedToolbar component | [#1254](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1254), green, unmerged; tab-list and indicator extracted, action/control sections remain |
| SA-71 | [#1248](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1248) Decompose oversized server metrics module | [#1255](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1255), green, unmerged; pure metric builders extracted, persistence/aggregation/routes remain |
| SA-72 | [#1249](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1249) Decompose oversized server billing module | [#1256](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1256), [#1257](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1257), [#1258](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1258), and [#1259](https://github.com/WxboySuper/Graphical-Forecast-Creator/pull/1259), green, unmerged; entitlement, refund-target, route availability, plan mapping, metadata, email, request-auth, and webhook resolver helpers extracted, event side effects and route orchestration remain |

## Final local verification

PR #1144 and cleanup PRs through #1266 are green at their recorded heads. PR #1183 is green after the supplied DeepSource report was fixed: the async wrapper, missing JSDoc, and scheduler declaration findings are resolved. PR #1185 implements SA36 by moving export attribution to a separate row, and PR #1186 implements SA37 by moving verification telemetry to the top row. PR #1188 removes the duplicate start script and updates Playwright to use the development command. PR #1190 removes orphaned v1.6 update assets, PR #1192 removes the unused layout resolver, and PR #1194 removes the unused capability alias and resolves six DeepSource findings. PR #1196 removes two unreferenced monitor WMS compatibility exports. PR #1198 removes the unreferenced KML download wrapper. PR #1200 removes the unreferenced cloud change detector and resolves eight DeepSource findings in that edited module. PR #1202 removes the unused verification kilometer constant. PR #1204 removes the unused outlook masking preview alias and resolves its explicit Turf import finding. PR #1206 removes the deprecated unreferenced cloud load modal and its dedicated tests while preserving the live save modal and CloudLibraryPage path. PR #1208 removes the unreferenced legacy integrated toolbar and keeps the tabbed toolbar used by the forecast workspace. PR #1210 removes two inert all-disabled feature registry entries and aligns the exposure matrix documentation. PR #1212 moves the investigation-only land-mask benchmark into its Jest module and removes the production benchmark file. PR #1214 moves the performance-only benchmark helpers into shared test utilities and documents their helper API after DeepSource review. PR #1216 consolidates duplicate GitHub REST request handling for promotion exposure and stale branch tooling, adds focused request tests, and resolves its DeepSource test-helper findings. PR #1218 shares map basemap orchestration between forecast and verification maps while preserving their distinct blank-mode behavior. PR #1220 shares raster tile and label setup across both map modes and the vector fallback. PR #1222 shares deployment defaults between beta and production entry points, preserves generated output, adds guarded inheritance tests, and distinguishes the entry points with explicit environment metadata after the refreshed duplicate scan. PR #1224 graduates three release-approved workstreams from temporary to permanent lifecycle metadata while retaining unreleased feature gates. PR #1226 graduates completed Auto-TSTM metadata and preserves its server capability gate. PR #1228 removes the unreferenced `parseOpenBetaPrsJson` compatibility export while preserving the canonical parser. PR #1230 removes the unreferenced `MANAGED_LABELS` aggregate while preserving the split label ownership sets. PR #1232 removes four unreferenced branch and changelog helper exports while preserving active policy behavior. PR #1234 consolidates the first seven remaining duplicate TypeScript import groups and resolves its DeepSource documentation and JSX nesting findings. PR #1236 consolidates map and monitor duplicate imports, preserves the OpenLayers test type alias after CI caught a regression, and resolves all DeepSource documentation findings introduced by the touched helpers. PR #1238 consolidates the utility, hook, store, routing, and verification duplicate imports, defers the two analyzer-heavy utility files for a later focused change, and resolves all remaining DeepSource findings including the recursive geometry validator ordering. PR #1240 consolidates the final instrumentation and test duplicate imports, preserves the Sentry namespace behavior, and passes the full check matrix. PR #1242 consolidates the deferred utility imports, documents their helper contracts, orders the cycle-history loaders for analyzer safety, and passes the full check matrix. PR #1250 extracts the pure auth/settings helpers from AuthProvider, adds direct helper coverage, resolves its CodeScene complexity finding, and passes the full check matrix. PR #1251 extracts hosted profile/settings synchronization, preserves the compatibility exports, resolves its DeepSource import finding, and passes the full check matrix. PR #1252 extracts local auth transport helpers, preserves compatibility exports, and passes the full check matrix. PR #1253 extracts AccountPage display and entitlement helpers, resolves its DeepSource documentation finding, and passes the full check matrix. PR #1254 extracts the IntegratedToolbar tab-list and indicator component and passes the full check matrix. PR #1256 extracts the pure billing entitlement and refund-target builders, adds focused Node coverage, and passes the full check matrix. PR #1257 extracts billing route helpers and passes the full check matrix. PR #1258 extracts billing request authentication, preserves its error contract, and passes the full check matrix. PR #1259 extracts billing webhook resolvers and passes the full check matrix. PR #1260 extracts OpenLayers preview synchronization, resolves its DeepSource documentation finding, and passes the full check matrix. PR #1261 extracts OpenLayers click handlers and passes the full check matrix. PR #1262 extracts OpenLayers utility helpers, preserves compatibility exports, and passes the full check matrix including DeepSource and e2e. PR #1263 extracts OpenLayers feature-edit handlers, shares modify listener setup, resolves CodeScene and DeepSource findings, and passes the full check matrix including e2e. PR #1264 extracts OpenLayers view synchronization, preserves the existing map-view policy, and passes the full check matrix including DeepSource, CodeScene, and e2e. PR #1265 extracts OpenLayers draw handling, resolves its DeepSource anti-pattern, and passes the final GitHub check set. PR #1266 extracts OpenLayers forecast source reconciliation and shared descriptor appliers. Its initial E2E regression exposed a live-versus-serialized geometry mistake; commit 526d39c6 restored the serialized geometry boundary, and the final full GitHub check set is green. SA-66 and SA-67 document the 1,510-line OpenLayers forecast map and 1,489-line forecast slice. SA-66 has its preview synchronizers, click handlers, and utility helpers, feature-edit handlers, view synchronization, and draw handling extracted in PRs #1260, #1261, #1262, #1263, #1264, #1265, and #1266. SA-71 and SA-72 remain documented oversized-module findings: server metrics (895) and server billing (752). SA-71 has its pure builders extracted in PR #1255, and SA-72 has its pure Stripe, request, and webhook resolver helpers extracted in PRs #1256, #1257, #1258, and #1259. SA-69 and SA-70 remain open for their remaining billing/deletion/auth/page and action/control decomposition work. All completed PRs have passed local validation and all required GitHub checks are green through PR #1266. Recheck their current heads before making follow-up changes. Keep opening focused PRs with detailed descriptions and wait for every required check before moving to the next one.









