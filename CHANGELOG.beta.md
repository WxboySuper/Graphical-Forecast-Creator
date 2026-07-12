# Beta Changelog

Development entries for pull requests targeting `beta`. These notes are consolidated and edited before release; they are not the production changelog.

## Unreleased

### PR #685

- Add Home workflow entry points for starting, resuming, updating, and uploading workflow packages.
- Protect workflow starts from disabled exposure targets and unsaved-cycle loss.

### PR #684

- Add a persistent workflow banner across the Forecast and Discussion routes with map, discussion, review, update, and export actions.
- Keep the workflow feature gated by the existing exposure policy until rollout adoption is updated.

### PR #682

- Add reusable workflow templates for Day 1, Day 2, Day 3, Days 4-8, and Full Outlook workflows with persistent activation in localStorage.
- Start workflow templates on the correct forecast day and support same-cycle updates plus start-from-previous-cycle behavior.
- Preserve workflow metadata when loading workflow-ready `forecast_cycle.json` files.
- Fix completion validation to respect the active workflow groupings and invalidate stale package completion when map or discussion content changes.
- Prevent local session restore from overwriting in-progress unsaved forecast or discussion state.

### PR #688

- Add the sliding active-tab background indicator and a touch of top breathing room around toolbar tabs.
- Slow and smooth the tab, panel, and button motion for a calmer feel.
- Make horizontal toolbar scrolling easier to use and styles Days as a segmented control.
- Separate Tools groups with compact tags.

### PR #687

- Replace the repeated header selection/status pill with compact context text and tighten the Days tab width.
- Add structure for grouped Tools actions and breathing room between ghost-layer icons and labels.

### PR #686

- Add horizontal breathing room to the forecast toolbar selection swatch (wider min width, larger padding and gap) and switch the probability digits to tabular-nums so the chip stays balanced with longer outlook names.
- Widen the Current Selection toolbar section to 360px so the swatch and toggle fit without crowding.

### PR #683

- Modernize the package review and completion dialogs with shared dialog primitives and review/export actions.

### PR #681

- Dependency: @radix-ui/react-dialog ^1.1.17 → ^1.1.18
- Dependency: @radix-ui/react-dropdown-menu ^2.1.18 → ^2.1.19
- Dependency: @radix-ui/react-popover ^1.1.17 → ^1.1.18
- Dependency: @radix-ui/react-tabs ^1.1.15 → ^1.1.16
- Dependency: @radix-ui/react-tooltip ^1.2.10 → ^1.2.11
- Dependency: @sentry/react ^10.62.0 → ^10.63.0
- Dependency: @types/node ^26.0.1 → ^26.1.0
- Dependency: immer ^11.1.8 → ^11.1.11
- Dependency: lucide-react ^1.22.0 → ^1.23.0
- Dependency: react-router-dom ^7.18.0 → ^7.18.1
- Dependency: vite ^8.1.0 → ^8.1.3
- Dependency: @sentry/node ^10.62.0 → ^10.63.0 (`server`)
### PR #670

- Address Greptile and CodeScene review feedback from prematurely merged #664: preserve legacy grouping data via `migrateLegacyForecastToSerializedPackage`, remove dead helpers, add typed `cycleMetadata` on `GFCForecastSaveData`, and reduce serialization complexity.

### PR #676

- Added 8-step agentic development workflow to AGENTS.md

### PR #664

- Added backward-compatible cycle and workflow serialization with v2 metadata support

### PR #666

- Added workflow completion validation with actionable missing item navigation and omission acknowledgement

### PR #660

- Define workflow v2 schema types: stable cycle/workflow IDs, cycle and outlook status enums, outlook versioning with derivation tracking, standard and custom groupings, workflow/cycle/package metadata, and schema version constant (WF-01, #451).
- Add 27 focused unit tests covering all type definitions and acceptance criteria.
- Re-export new types from `outlooks.ts` for backward compatibility.

### PR #655

- Move Monitor UI and map components under `src/monitor/components` so Monitor domain logic and implementation components share one feature-owned area.

### PR #654

- Add the #445 codebase inventory and reorganize docs into architecture, operations, product, releases, and review-removal archive areas.

### PR #653

- Port deployment feature-switch config from #651: add per-target config files under `deploy/` and wire beta, staging, and production analytics env generation through the checked-out deploy ref.
- Harden deployment config validation for newline injection, path traversal, and readable CLI errors.

### PR #650

- Add Auto-TSTM beta tester plans, including a short step-by-step test, a full forecast test, and copy-ready report templates.
- Document that beta deployment enables Auto-TSTM generation and ingestion through `deploy/beta-deployment-config.json`.

### PR #649

- Integrate Auto-TSTM preview, apply, cancel, and stale-result protection in the forecast editor (TSTM-05, #476).
- Fetch cached guidance via `requestLatestTstmData`, render ephemeral map preview with run/source/validity metadata, and apply through one undoable `replaceTstmFeatures` replacement.
- Reject late cycle/day responses using `isCurrentTstmRequest`; preserve existing polygons on failure or cancel.
- Enable `autoTstm` on beta behind `ServerBackedFeatureBoundary` when server capability is available.

### PR #648

- Harden cached Auto-TSTM API: public read policy, rate limits on `GET /api/tstm/latest` and `GET /api/tstm/status`, structured stale/unavailable/corrupt error reasons, and operational cache health (TSTM-04, #475).
- Align ingestion cache schema with client response validation (`forecastHours`, `warnings`).
- Extend Auto-TSTM server/client tests and exposure contracts for the latest and status routes.
- Document Auto-TSTM operational behavior in `docs/auto-tstm-operations.md`.

### PR #647

- Reduce redundant Turf feature collection allocation in Auto-Categorical hatching and cumulative risk generation (PERF-04, #589).
- Extend Auto-Categorical tests for hatching splits, cumulative risk rings, and allocation regression coverage.

### PR #646

- Add scheduled TSTM ingestion: periodic server-side discovery of new HREF runs with golden-copy caching that only replaces confirmed data (TSTM-03, #474).
- Add `GET /api/tstm/latest` endpoint for pre-cached TSTM data.
- Add `--ingestion-mode` flag to Python generator for completeness metadata.
- Add `requestLatestTstmData()` client utility.

### PR #645

- Fix Sentry GFC-WEB-G by portaling the Forecast Cycle History modal to `document.body`, unifying its overlay/dialog shell with `notranslate`, deferring parent close after nested confirm actions, and stacking confirm overlays above the history dialog.

### PR #644

- Adopt the feature exposure registry across all six v1.7 workstreams: adoption manifest, registry-only acknowledgements, v1.7 adoption policy rule, adoption exposure tests, gated-route smoke checks, and tracker cross-links (FND-14, #530).

### PR #643

- Add reusable feature exposure test fixtures and harness for client/server disabled-side-effect contracts, exemplar coverage for `tropicalWorkspace` and `autoTstm`, `pnpm test:exposure`, and documentation (FND-13, #529).

### PR #637

- Dependency: @sentry/react ^10.59.0 → ^10.62.0
- Dependency: @types/node ^26.0.0 → ^26.0.1
- Dependency: lucide-react ^1.21.0 → ^1.22.0
- Dependency: @playwright/test ^1.61.0 → ^1.61.1
- Dependency: @tailwindcss/postcss ^4.3.1 → ^4.3.2
- Dependency: @vitejs/plugin-react ^6.0.2 → ^6.0.3
- Dependency: autoprefixer ^10.4.27 → ^10.5.2
- Dependency: tailwindcss ^4.3.1 → ^4.3.2
- Dependency: vite ^8.0.16 → ^8.1.0
- Dependency: @sentry/node ^10.59.0 → ^10.62.0 (`server`)
- Dependency: firebase-admin ^14.0.0 → ^14.1.0 (`server`)
- Dependency: stripe ^22.2.2 → ^22.3.0 (`server`)

### PR #635

- Add feature exposure diagnostics for maintainers: typed resolution helpers, `pnpm exposure:diagnostics` CLI, and a local-only dev page showing why each feature is enabled or disabled (FND-12).

### PR #636

- Document Cursor Cloud development environment setup in `AGENTS.md` (dependency install flow, frontend/backend run commands, and non-obvious lint/typecheck/test caveats).

### PR #632

- Add server-authoritative emergency capability disable via `EMERGENCY_DISABLED_CAPABILITIES`, including fail-closed parsing, `/api/capabilities/status`, and client runtime fallback for already-mounted server-backed features (FND-11, #527).

### PR #631

- Add weekly/manual stale branch reporting for `feature/*`, `fix/*`, and `research/*` branches with a 14-day grace period, orphaned vs open-PR grouping, and commits-behind-`beta` metadata (#494).

### PR #630

- Harden `cleanup-port-branches` workflow: replace `pull_request_target` with `pull_request`, validate port branch names against the automation allowlist before ref deletion, and document security-critical guards (#606).

### PR #629

- Pin all third-party workflow actions to immutable commit SHAs; enable Dependabot `github-actions` updates (#604).

### PR #616

- Complete PR #612 porting on beta: hotfix merges into `main` use reviewable port PRs instead of direct post-merge beta sync. Preserves `betaContainsMain` port PR policy checks from earlier beta work.

### PR #610

- Add beta-to-main production exposure report (\`pnpm exposure:report\`), promotion CI gate, and single upserted PR comment with pass/fail status tables for promotion PRs (FND-07).

### PR #609

- Complete FND-06 feature exposure CI policy with bidirectional client/server registry alignment, side-effect key validation, and acknowledgement manifest enforcement for gated features.

### PR #590

- Add feature exposure labels (`exposure:production`, `exposure:server-backed`, `exposure:registry-change`) to automatically tag PRs that change feature exposure configuration.

### PR #582

- Dependency: @radix-ui/react-dialog ^1.1.16 → ^1.1.17
- Dependency: @radix-ui/react-dropdown-menu ^2.1.17 → ^2.1.18
- Dependency: @radix-ui/react-popover ^1.1.16 → ^1.1.17
- Dependency: @radix-ui/react-slot ^1.2.5 → ^1.3.0
- Dependency: @radix-ui/react-tabs ^1.1.14 → ^1.1.15
- Dependency: @radix-ui/react-tooltip ^1.2.9 → ^1.2.10
- Dependency: @sentry/react ^10.58.0 → ^10.59.0
- Dependency: @types/node ^25.9.3 → ^26.0.0
- Dependency: firebase ^12.14.0 → ^12.15.0
- Dependency: lucide-react ^1.18.0 → ^1.21.0
- Dependency: react-router-dom ^7.17.0 → ^7.18.0
- Dependency: rollup >=4.62.0 → >=4.62.2
- Dependency: uuid ^14.0.0 → ^14.0.1
- Dependency: @babel/core ^7.29.7 → ^8.0.1
- Dependency: @babel/preset-env ^7.29.7 → ^8.0.2
- Dependency: @babel/preset-react ^7.29.7 → ^8.0.1
- Dependency: @babel/preset-typescript ^7.29.7 → ^8.0.1
- Dependency: @sentry/node ^10.58.0 → ^10.59.0 (`server`)
- Dependency: stripe ^22.2.1 → ^22.2.2 (`server`)
### PR #579

- Add CI policy validation for feature exposure metadata, gated routes, navigation, and matching server capabilities.

### PR #577

- Replace mutable Redux product flags with typed build-target exposure selectors so core forecast capabilities read from the feature registry instead of browser state.

### PR #573

- Add centralized server capability lookup, route gates, and `SERVER_TARGET` deploy env wiring so experimental APIs reject before expensive work and stay aligned with the client feature exposure registry.

### PR #572

- Gate client routes, navigation, lazy modules, and mount boundaries through the feature exposure registry so disabled v1.7 work never registers paths, shows nav links, or initializes effects.

### PR #571

- Add the typed feature exposure registry with per-target matrices, lifecycle metadata, and `isFeatureExposed` helpers for v1.7 workstreams.

### PR #568

- Add explicit, validated local, beta, staging, and production frontend build targets while preserving the existing beta access gate.

### PR #548

- Document Auto-TSTM SPC calibrated thunder inputs, thresholds, and Day 1/2 window definitions; add fixture tests for period hours and thresholds.

### PR #547

- Dependency: @sentry/react ^10.56.0 → ^10.58.0
- Dependency: @types/node ^25.9.2 → ^25.9.3
- Dependency: lucide-react ^1.17.0 → ^1.18.0
- Dependency: rollup >=4.61.1 → >=4.62.0
- Dependency: @playwright/test ^1.59.1 → ^1.61.0
- Dependency: @tailwindcss/postcss ^4.2.4 → ^4.3.1
- Dependency: tailwindcss ^4.2.2 → ^4.3.1
- Dependency: @sentry/node ^10.56.0 → ^10.58.0 (`server`)
- Dependency: firebase-admin ^13.8.0 → ^14.0.0 (`server`)
- Dependency: stripe ^22.2.0 → ^22.2.1 (`server`)
### PR #526

- Preserve the hidden Auto-TSTM client API boundary, response validation, and stale-request identity without mounting unfinished controls.

### PR #525

- Preserve the Auto-TSTM Python GRIB2 generator and server adapter behind a default-off deployment capability with focused tests; retire the obsolete generic HREF inventory probe.
