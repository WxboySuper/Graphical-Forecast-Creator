# Codebase audit, September 5, 2026

Baseline: `32c2ccc0d532a227eed83232401fa89d5bb04a22` on `main`.

The audit indexed all 1,079 tracked files, parsed JavaScript and TypeScript imports and function boundaries, compared repeated source blocks, and checked callers before identifying retired modules. The inventory includes 618 source/configuration files with 88,154 lines and 312 test files. Lockfiles and generated utility CSS are excluded from the source-line total. Python, shell, workflows, manifests, documentation, and static assets received a structural review alongside the frontend and server review.

The review covers every repository area. Behavioral inspection focused on imports/exports, persistence, map rendering and editing, Monitor request lifetimes, auth/billing, verification, release tooling, and test enforcement. An import-graph finding is a candidate until callers and intentional feature boundaries are checked. This is an evidence-backed cleanup list, not a claim that every line is correct or every large file needs splitting.

| Area | Tracked files |
| --- | ---: |
| .Jules | 1 |
| .codescene | 1 |
| root | 28 |
| .github | 20 |
| deploy | 9 |
| docs | 54 |
| e2e | 13 |
| public | 21 |
| scripts | 115 |
| server | 82 |
| src | 734 |
| tests | 1 |

## Baseline verification

- Application typecheck passed.
- Test typecheck passed with 158 current errors under a 182-error allowance.
- Jest passed 236 suites and 1,435 tests. One additional suite failed because it requires a production build before ordinary tests. It passed after the build.
- All 159 discovered server tests passed, including three suites missing from the package test command.
- Script discovery passed 258 tests and failed two boundary integrity tests in the Windows checkout. Git's CRLF conversion changes the pinned bytes, and the failure formatter throws a second error.
- Production build passed.
- Lint and tooling typecheck passed. The first lint run found an unused import in the ignored audit scanner, which was removed before the clean rerun.

## Review decisions

The four selectable forecast layouts are supported user preferences. Their existence alone is not a deletion reason. The weather grading algorithms, bounded import validation, account isolation, capability gates, and hosted billing checks remain behavior contracts during cleanup. Versioned formats and historical release documents can serve real compatibility or provenance needs. Vendored geodata is checked against its declared checksums rather than judged by file size.

No application fixes preceded this report or issue creation. Work will use focused PRs, with stacks only where changes depend on earlier patches. Each issue states its own acceptance checks; every PR must also finish the repository checks.

## Findings

### SA-01. Discover all server tests instead of maintaining a filename list

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1110

Files: `server/package.json`.

npm test omits billing-config.test.js, metrics-storage.test.js, and lib/emergencyCapabilityOverrides.test.js. These files pass when discovered directly, but CI never runs them.

Proposed fix: Use automatic test discovery limited to server tests and document the command.

Validation: Run every server test and verify the three omitted suites appear.

### SA-02. Run all script tests in CI and remove duplicate Jest coverage runs

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1111

Files: `.github/workflows/ci.yml`, `package.json`.

The script test command omits six root-level test files, including exposure integration and documentation/license generators, and lists license-policy.test.mjs twice. The frontend matrix also runs the full Jest suite twice per Node version to produce coverage.

Proposed fix: Add a complete scripts test command and use one coverage-enabled Jest run per matrix entry.

Validation: Run all script tests and retain failures as blocking CI results.

### SA-03. Add the existing Auto-TSTM Python tests to CI

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1112

Files: `server/weather/test_generate_tstm.py`, `server/requirements.txt`, `.github/workflows/ci.yml`.

The numerical weather generator has a unittest suite, but no GitHub workflow executes it. Node route tests do not exercise its window and probability calculations.

Proposed fix: Add a Python job using pinned requirements and unittest discovery.

Validation: Execute the Python suite locally and in CI without live upstream downloads.

### SA-04. Separate production bundle verification from ordinary Jest tests

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1113

Files: `src/hooks/categoricalBundleBoundary.test.ts`, `scripts/check-bundle-budget.mjs`.

pnpm test fails on a clean checkout because a Jest test requires build/assets. The failure occurs after 236 unrelated suites pass.

Proposed fix: Keep source/worker behavior in Jest and run the built-bundle assertion with the existing post-build checks.

Validation: Plain Jest passes without build artifacts, and post-build verification still rejects an eager Turf dependency.

### SA-05. Preserve vendored boundary checksums across Windows checkouts

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1114

Files: `src/config/geoBoundarySources.ts`, `scripts/validate-geo-assets.test.mjs`, `public/geodata`.

With core.autocrlf=true, checkout changes vendored text asset bytes and breaks pinned SHA-256 validation. The failure reporter passes an array to assert.ok, which raises a second error and hides the diagnostics.

Proposed fix: Pin LF for checksummed text assets with Git attributes and format assertion messages as text.

Validation: Validate pinned bytes in a fresh Windows checkout and retain failure coverage for changed bytes.

### SA-06. Remove the package command for the deleted beta changelog script

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1115

Files: `package.json`.

changelog:consolidate-beta invokes scripts/consolidate-beta-changelog.mjs, which does not exist in the tracked tree.

Proposed fix: Remove the stale command and any current documentation pointing to it.

Validation: Verify every repository script path declared in package.json exists.

### SA-07. Separate development dependencies from shipped application dependencies

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1116

Files: `package.json`, `pnpm-lock.yaml`, `server/package.json`.

Testing Library, Jest/Node/React type packages, TypeScript, cross-env, and Rollup are listed as production dependencies. The unused @types/uuid package duplicates UUID's bundled types. The server advertises Node 18 despite dependencies requiring newer Node releases.

Proposed fix: Move tooling to devDependencies, remove unused type stubs, and align the server engine declaration with the tested runtime range.

Validation: Frozen install, licenses, build, typechecks, and dependency audits.

### SA-08. Remove unused Create React App bootstrap artifacts

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1117

Files: `src/reportWebVitals.ts`, `src/index.tsx`, `src/logo.svg`, `docs/coverage-exclusions.md`, `package.json`.

The only reportWebVitals call has no callback, so the helper never imports or records metrics. The React logo has no caller. Both remain alongside Vite configuration and a direct web-vitals dependency.

Proposed fix: Remove the no-op telemetry wrapper, unused logo, unused dependency, and obsolete coverage references.

Validation: Build, app smoke tests, and no remaining references.

### SA-09. Remove retired day, outlook, toolbar, and drawing control implementations

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1118

Files: `src/components/DaySelector`, `src/components/OutlookDaySelector`, `src/components/OutlookSelector`, `src/components/Toolbar`, `src/components/DrawingTools/DrawingTools.tsx`.

These components are unreachable from src/index.tsx and only imported by their own tests or unused barrel files. Active forecast layouts use ForecastWorkspace and IntegratedToolbar instead. Their tests keep retired UI alive.

Proposed fix: Remove the disconnected controls, exclusive helpers/styles, and retired tests while preserving the live export hook and all four supported forecast layouts.

Validation: Import graph, typecheck, forecast layout tests, and browser checks for each layout.

### SA-10. Remove the disconnected legacy discussion editor

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1119

Files: `src/components/DiscussionEditor/DiscussionEditor.tsx`, `src/components/DiscussionEditor/DiscussionEditor.test.tsx`.

The 460-line DiscussionEditor has no application consumer. DiscussionPage owns the live editor and grouping-aware draft behavior.

Proposed fix: Remove the old editor and its exclusive test/assets, preserving the live discussion flow.

Validation: Discussion tests and discussion browser workflow.

### SA-11. Remove obsolete map controls and the unused React alert popup

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1120

Files: `src/components/Map/DeleteConfirmation.tsx`, `src/components/Map/OverlayControls.tsx`, `src/components/Map/useOutlookLayersState.ts`, `src/components/Map/precisionPolygonEditHandler.ts`, `src/monitor/components/MonitorAlertPopup.tsx`, `src/utils/domUtils.ts`.

These implementations have only test consumers. Live maps use current map handlers and an imperative alert popup. The unused precision handler also differs from the live geometry trimming path.

Proposed fix: Remove disconnected implementations and their exclusive tests while retaining active popup and precision-edit coverage.

Validation: Map tests, alert popup tests, precision editing and deletion browser checks.

### SA-12. Remove disconnected workflow serialization and analytics compatibility layers

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1121

Files: `src/utils/workflowSerialization.ts`, `src/lib/workflowAnalytics.ts`, `src/types/workflowAnalytics.ts`.

Only their own tests call these modules. The application uses workflowPackage and productAnalytics, leaving parallel serializers and event validators that can drift.

Proposed fix: Remove unused implementations and tests, retain schema types required by active import compatibility, and update current documentation.

Validation: Import/export compatibility, workflow analytics tests, and typecheck.

### SA-13. Use one forecast workspace registry

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1122

Files: `src/config/forecastWorkspaces.ts`, `src/routing/forecastWorkspaceRoutes.ts`, `src/routing/forecastWorkspacePersistence.ts`.

Two files define the same workspace ID union and route/exposure tables. The config registry only has test consumers, while routing owns the application contract.

Proposed fix: Remove the redundant registry and move any useful persistence validation tests onto the canonical routing helpers.

Validation: Workspace route, exposure, and persistence tests, including invalid inputs.

### SA-14. Resolve the disconnected verification share-card implementation

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1123

Files: `src/components/ForecastGrade/ShareCard.tsx`, `src/components/ForecastGrade/shareCard.ts`, `src/components/ForecastGrade/useCaptureGradeMap.ts`, `src/components/ForecastGrade/useShareCardActions.ts`.

The share-card component and capture hook have no application callers, leaving an isolated feature subtree. ShareCard.tsx and shareCard.ts also differ only by case, which is awkward on Windows.

Proposed fix: Trace the intended verification UX and either connect the existing share controls with behavior coverage or remove the abandoned subtree. Use unambiguous filenames.

Validation: Verification browser workflow and share/download tests if connected; import graph and existing verification tests if removed.

### SA-15. Remove the Leaflet export fallback after the OpenLayers migration

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1124

Files: `src/utils/exportUtils.ts`, `src/App.tsx`, `src/setupTests.ts`, `src/components/Map/ForecastMap.css`, `src/darkMode.css`, `src/maps/contracts.ts`, `vite.config.ts`, `package.json`.

Both map adapters directly export OpenLayers implementations. Leaflet remains for an unreachable export fallback, global styles, vendor chunk rules, and mocks. Hundreds of lines recreate a map engine that the application no longer instantiates.

Proposed fix: Keep the live OpenLayers export path, remove the Leaflet fallback and dependencies, and replace obsolete fallback tests with active export coverage.

Validation: Image export tests and browser JPEG export with legends, tile failures, and canvas rendering.

### SA-16. Share forecast and verification map style helpers

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1125

Files: `src/components/Map/openLayersMapStyles.ts`, `src/components/Map/OpenLayersVerificationMap.tsx`.

The verification map copies layer replacement, color/opacity, and outlook styling helpers. The duplicate scan found 47 overlapping twelve-line windows between these files.

Proposed fix: Use shared pure styling helpers with explicit options for intentional verification differences.

Validation: Existing map style tests and forecast/verification visual checks.

### SA-17. Share asynchronous basemap style loading and cleanup

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1126

Files: `src/components/Map/OpenLayersForecastMap.tsx`, `src/components/Map/OpenLayersVerificationMap.tsx`.

Both maps duplicate the OpenFreeMap fetch/apply/replace sequence and request-generation checks. Stale style groups are abandoned without an explicit cleanup path.

Proposed fix: Extract the shared layer-loading operation with clear stale-result and failure handling.

Validation: Fast style switches, failed style requests, and map unmount behavior.

### SA-18. Use one blob download helper

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1127

Files: `src/utils/forecastTransfer/index.ts`, `src/utils/kmzExport/index.ts`, `src/utils/fileUtils.ts`.

Transfer and KMZ entry points contain identical triggerBlobDownload implementations, and native exports repeat object-URL lifecycle code.

Proposed fix: Share creation, click, DOM cleanup, and delayed URL revocation for blob downloads.

Validation: Native and KML/KMZ export tests, including cleanup after a failed click.

### SA-19. Share custom-product validation primitives

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1128

Files: `src/lib/customCategoryValidation.ts`, `src/lib/customProductSnapshots.ts`.

Both modules copy isRecord, hasOnlyKeys, and the same bounded-label validator with the same product limit.

Proposed fix: Move the shared product validators to one small module while retaining strict boundary validation.

Validation: Malformed category and snapshot tests, including extra keys and whitespace.

### SA-20. Stop stale and overlapping Monitor alert refreshes

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1129

Files: `src/monitor/useMonitorNwsAlertsRefresh.ts`, `src/monitor/useMonitorNwsAlertsLoad.ts`.

Refresh cleanup clears only the interval. Pending requests can append frames after disable/unmount, and slow requests overlap. The snapshot appender is copied into the initial-load hook even though that hook always passes an empty list.

Proposed fix: Guard request lifetime, prevent overlapping refreshes, and remove redundant snapshot logic from initial load.

Validation: Deferred response tests for disable/unmount and slow polling, plus frame deduplication and limits.

### SA-21. Connect alert-banner validation and scheduling to the live hook

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1130

Files: `src/components/useAlertBanner.ts`, `src/components/alertBannerConfig.ts`, `src/components/AlertBanner.tsx`.

The live hook casts arbitrary response JSON to AlertConfig and bypasses the existing normalizer and startsAt/expiresAt policy. It has no stale-request guard and retains the old banner after a new path fails.

Proposed fix: Use the shared config type/normalizer, apply schedule bounds, reset failed loads, and ignore stale responses.

Validation: Malformed JSON shapes, expired/future banners, failed path changes, and out-of-order fetches.

### SA-22. Reject invalid timestamps when choosing autosave snapshots

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1131

Files: `src/hooks/useAutoSave.ts`.

getAutoSaveTimestamp returns NaN for an invalid date string despite its documented zero fallback. Comparisons against NaN are false, so a malformed first candidate can beat a valid newer autosave.

Proposed fix: Return zero for missing or non-finite timestamps and preserve newest-valid selection.

Validation: Invalid date strings, malformed JSON, missing timestamps, and valid snapshot ordering.

### SA-23. Bound queued analytics events and clean up failed tracker scripts

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1132

Files: `src/lib/productAnalytics.ts`.

When the tracker is blocked or never loads, pendingEvents grows without a limit. A script error resets initializedZone but leaves the failed element, so repeated attempts add more scripts.

Proposed fix: Cap queued events, deduplicate tracker elements, and clean failed loads while preserving explicit consent.

Validation: Blocked/failed tracker loads, queue limits, retry, and opt-out teardown.

### SA-24. Share duplicate server Firebase bearer-token verification

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1133

Files: `server/beta.js`, `server/metrics.js`.

Both route modules contain the same verifyRequestUser implementation, including missing-token and verification-failure handling.

Proposed fix: Use a shared verifier without changing route authorization policies.

Validation: Missing, malformed, valid, and rejected tokens plus both route suites.

### SA-25. Consolidate duplicate legacy analytics viewer commands

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1134

Files: `scripts/view-analytics.js`, `server/view-analytics.js`.

Two commands parse and print the same historical JSONL analytics reports. Their presentation and parsing behavior have diverged, while current metrics use Firestore and Umami.

Proposed fix: Keep one implementation with a compatibility entry point only where documented use requires it, and state that the input is legacy JSONL.

Validation: Fixture-based command output, malformed lines, missing input, and documented invocation paths.

### SA-26. Remove the expired March 2026 launch countdown and gate

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1135

Files: `src/App.tsx`, `src/pages/ComingSoonPage.tsx`, `vite.config.ts`, `src/vite-env.d.ts`, `babel.config.js`.

The March 1 launch date has passed, but its duplicated timestamp, countdown UI, timer hook, build define, and showComingSoon props still run through the app and agreement flow.

Proposed fix: Remove the expired launch machinery and simplify routing/agreement composition while preserving ToS, privacy consent, and beta access checks.

Validation: App routes, agreement flow, and beta-gated browser smoke checks.

### SA-27. Reuse local-date helpers for workflow suggestions and Home

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1136

Files: `src/components/ForecastWorkflow/ForecastWorkflowPanel.tsx`, `src/pages/home/useHomePageLogic.ts`, `src/utils/localDate.ts`.

getYesterdayLocalDate subtracts a local calendar day and then formats with toISOString, producing the preceding date east of UTC. Home also copies the existing local calendar formatter.

Proposed fix: Use the shared local-date formatter after calendar arithmetic and remove the Home duplicate.

Validation: Timezone tests east and west of UTC and daylight-saving transitions.

### SA-28. Make outlook trimming independent of the global land-mask cache

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1137

Files: `src/store/forecastSlice.ts`, `src/hooks/useTrimCurrentDayOutlooks.ts`.

The trim reducer reads getCachedLandMask, so replaying the same state/action can either edit geometry or do nothing depending on external cache state. An explicit target day still pushes the current day's undo snapshot.

Proposed fix: Pass deterministic trim input/results through the action and ensure undo snapshots belong to the edited day. Guard asynchronous trimming against a changed forecast session.

Validation: Identical state/action results with cleared cache, non-current-day undo, and day/cycle changes during mask loading.

### SA-29. Keep modal focus stable when the close callback changes

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1138

Files: `src/hooks/useModalFocusTrap.ts`.

The focus-trap effect depends on onClose. Callers frequently pass inline callbacks, so a rerender tears down isolation, restores old focus, and focuses the first modal control again.

Proposed fix: Keep the close callback current without restarting the focus lifecycle for unrelated rerenders.

Validation: Type into a non-first control, rerender, verify focus is retained, and confirm Escape uses the latest callback.

### SA-30. Eliminate the permitted test TypeScript errors

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1139

Files: `scripts/check-test-types.mjs`, `scripts/test-type-errors-baseline.json`, `tsconfig.test.json`, `src/**/*.test.ts`, `src/**/*.test.tsx`.

The test typecheck passes with 158 current diagnostics under a baseline of 182. Per-file error-code counts can also hide a new error replacing an old error of the same code.

Proposed fix: Fix remaining test typings after removing dead suites, split repairs into focused PRs, and replace the baseline with a strict test typecheck once clean.

Validation: Application, tooling, and test typechecks all pass with zero diagnostics; Jest remains green.

### SA-31. Restore reproducible utility CSS generation

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1140

Files: `src/index.css`, `src/tailwind.generated.css`, `tailwind.compat.config.js`, `postcss.config.js`, `package.json`.

The app imports a frozen utility stylesheet. PostCSS only runs autoprefixer, the compatibility config is unused, and no script regenerates the CSS. New utility classes can build successfully without receiving any styles.

Proposed fix: Restore a reproducible build/watch path using the compatibility design tokens, remove unused Tailwind tooling, and verify existing layouts before retiring the snapshot.

Validation: A newly added utility is emitted, production build works from a clean checkout, and screenshots cover light/dark modes and toolbar layouts.

### SA-32. Count premium subscriptions without fetching every entitlement document

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1141

Files: `server/metrics.js`.

countPremiumSubscriptions queries all active/trialing entitlement documents and uses only snapshot.size. Every cache miss transfers complete documents for a scalar admin metric.

Proposed fix: Use Firestore's count aggregation while retaining the existing TTL and in-flight request sharing.

Validation: Count result, cache hit, concurrent callers, and failed-request retry tests.

### SA-33. Remove duplicated local sign-in and sign-up orchestration

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1142

Files: `src/auth/AuthProvider.tsx`.

localSignInWithEmail and localSignUpWithEmail repeat dependency types, destructuring, POST handling, response application, and metric dispatch. Only endpoint, error text, and event differ.

Proposed fix: Share the local credential action and dependency contract while preserving both public actions and errors.

Validation: Local sign-in/sign-up success, HTTP error, malformed response, and hosted auth regression tests.

### SA-34. Scope cloud sync completion to the selected cycle

Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1143

Files: `src/hooks/useCloudSync.ts`, `src/hooks/useCloudCycles.ts`.

lastSyncedHash is not tied to a cloud cycle ID, so selecting another cycle with identical content can appear synced without a save. A pending save also updates the current selection's sync state after selection changes.

Proposed fix: Track sync identity and request generation, ignore completions for replaced selections, and preserve pending edits for the current cycle.

Validation: Same-content cycle switches, out-of-order saves, selection clearing, and sign-out during a save.
