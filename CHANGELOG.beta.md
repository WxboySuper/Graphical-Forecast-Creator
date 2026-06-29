# Beta Changelog

Development entries for pull requests targeting `beta`. These notes are consolidated and edited before release; they are not the production changelog.

## Unreleased

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
