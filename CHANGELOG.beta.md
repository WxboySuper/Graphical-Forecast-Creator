# Beta Changelog

Development entries for pull requests targeting `beta`. These notes are consolidated and edited before release; they are not the production changelog.

## Unreleased

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
