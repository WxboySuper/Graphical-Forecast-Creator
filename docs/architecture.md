# GFC Repository Map and Architecture Overview

This is the **current-state** map of the Graphical Forecast Creator (GFC) repository. It tells contributors where the major behavior lives, how the pieces connect, and how the repository is built, tested, and shipped. Future plans are kept separate and clearly marked — see [Current versus target structure](#current-versus-target-structure).

- Scope: the whole repo at `main`/`beta` head.
- Facts below were verified against the tree at the time of writing; every linked path is real.

---

## Repository layout

Top-level map of the repository:

| Path | What it is |
|------|------------|
| [`src/`](../src) | Frontend single-page application (React 19 + TypeScript + Vite). |
| [`server/`](../server) | Companion Node/Express API package (`gfc-analytics`) — analytics, billing, metrics, beta access, Sentry tunnel. |
| [`scripts/`](../scripts) | Release/version/CI policy automation (run inside GitHub Actions or locally). |
| [`deploy/`](../deploy) | Deployment feature config and the production rollout manifest. |
| [`.github/`](../.github) | Workflows, PR templates, porting automation, Dependabot config. |
| [`docs/`](.) | Human-facing documentation (release workflow, rollout runbooks, PRDs, this document). |
| [`e2e/`](../e2e) | Playwright end-to-end specs. |
| [`tests/`](../tests) | Non-Jest test suites (Firestore rules). |
| [`public/`](../public) | Static assets served as-is (favicons, manifest, alert banner, CWA boundaries). |
| Root files | [`package.json`](../package.json), [`vite.config.ts`](../vite.config.ts), [`tsconfig.json`](../tsconfig.json), [`firebase.json`](../firebase.json), [`firestore.rules`](../firestore.rules), [`index.html`](../index.html), changelogs, [`ROADMAP.md`](../ROADMAP.md), [`AGENTS.md`](../AGENTS.md). |

> Note: [`graphical-forecast-creator/`](../graphical-forecast-creator) at the repo root is a stale leftover from an earlier layout. It is not part of the Vite build (the Vite root is the repository root) and is ignored here.

---

## Frontend entry points and data flow

### Bootstrap chain

1. [`index.html`](../index.html) — loads the module script and the `#root` mount point.
2. [`src/index.tsx`](../src/index.tsx) — imports `./immerSetup`, CSS, and `App`; creates the React root; wires Sentry error handlers when enabled; calls `reportWebVitals()` and `trackPageView()`.
3. [`src/App.tsx`](../src/App.tsx) — the provider stack and router:

```
<Provider store={store}>            // Redux
  <AuthProvider>                    // src/auth/AuthProvider.tsx
    <EntitlementProvider>           // src/billing/EntitlementProvider.tsx
      <BrowserRouter>
        <AgreementGate />           // ToS / Privacy modals → <AppHooks />
        <AppRoutes />
```

`AppRoutes` defines the client-side routes (see table below). `AppHooks` runs the app-wide hooks: `useAutoCategorical`, `useAutoSave`, `useFirestoreSleepRecovery`, `useCycleHistoryPersistence`, and feature-flag initialization.

### Route table

Routes are declared in [`src/App.tsx`](../src/App.tsx#L125) (`AppRoutes`) and page components are re-exported from [`src/pages/index.ts`](../src/pages/index.ts). `AppLayout` (`src/components/Layout/AppLayout.tsx`) provides the navbar, toasts, and the documentation panel around guarded routes.

| Path | Page |
|------|------|
| `/` | [`HomePage`](../src/pages/HomePage.tsx) |
| `/forecast` | [`ForecastPage`](../src/pages/ForecastPage.tsx) — the primary editor |
| `/discussion` | [`DiscussionPage`](../src/pages/DiscussionPage.tsx) |
| `/verification` | [`VerificationPage`](../src/pages/VerificationPage.tsx) |
| `/monitor` | [`MonitorPage`](../src/pages/MonitorPage.tsx) |
| `/cloud` | [`CloudLibraryPage`](../src/pages/CloudLibraryPage.tsx) |
| `/account` | [`AccountPage`](../src/pages/AccountPage.tsx) |
| `/pricing` | [`PricingPage`](../src/pages/PricingPage.tsx) |
| `/admin` | [`AdminPage`](../src/pages/AdminPage.tsx) |
| `/updates` | [`UpdatesPage`](../src/pages/UpdatesPage.tsx) |
| `/beta`, `/beta-access/:invitePath?` | Beta landing / invite pages |
| `/` (coming-soon mode) | [`ComingSoonPage`](../src/pages/ComingSoonPage.tsx) |

`BetaAccessGuard` (`src/components/Beta/BetaAccessGuard.tsx`) gates most routes behind beta access. A launch gate (`__GFC_COMING_SOON__` + `LAUNCH_TIME` in `App.tsx`) can put the app into coming-soon mode.

### State management and data flow

Redux Toolkit store assembled in [`src/store/index.ts`](../src/store/index.ts), with a Sentry enhancer and a serializable-check middleware configured for `Map`-backed outlook data. Slices:

| Slice file | Manages |
|------------|---------|
| [`src/store/forecastSlice.ts`](../src/store/forecastSlice.ts) | The forecast editor document: `forecastCycle`, per-day `OutlookData` (Maps of GeoJSON features), `currentDay`, drawing state, cycle history, per-day undo/redo. Core of the app. |
| [`src/store/featureFlagsSlice.ts`](../src/store/featureFlagsSlice.ts) | Outlook availability and feature-flag booleans. |
| [`src/store/overlaysSlice.ts`](../src/store/overlaysSlice.ts) | Basemap style, state/county borders, ghost-outlook visibility. |
| [`src/store/stormReportsSlice.ts`](../src/store/stormReportsSlice.ts) | Storm report list, filters, loading/error/visibility. |
| [`src/store/appModeSlice.ts`](../src/store/appModeSlice.ts) | `forecast` vs `verification` mode. |
| [`src/store/themeSlice.ts`](../src/store/themeSlice.ts) | Dark mode (persisted + DOM class side effects). |
| [`src/store/verificationSlice.ts`](../src/store/verificationSlice.ts) | Loaded forecast used by the verification workflow. |
| [`src/store/monitorSlice.ts`](../src/store/monitorSlice.ts) | Monitor page settings (radar/satellite/alerts/outlook/animation). |
| [`src/store/sentryEnhancer.ts`](../src/store/sentryEnhancer.ts) | Redux action breadcrumbs + scope tags for Sentry. |

Data flow notes:

- Persistence is client-side for local work: [`useAutoSave`](../src/hooks/useAutoSave.ts) writes a debounced copy to `localStorage`; [`cycleHistoryPersistence`](../src/utils/cycleHistoryPersistence.ts) hydrates/persists `savedCycles`.
- Cloud sync (Firestore) is driven by [`useCloudCycles`](../src/hooks/useCloudCycles.ts) and [`useCloudSync`](../src/hooks/useCloudSync.ts), backed by [`src/lib/cloudCyclesService.ts`](../src/lib/cloudCyclesService.ts).
- Auth/entitlements live in React context layered above Redux: [`src/auth/AuthProvider.tsx`](../src/auth/AuthProvider.tsx) and [`src/billing/EntitlementProvider.tsx`](../src/billing/EntitlementProvider.tsx).

### Feature directories

| Directory | Contents |
|-----------|----------|
| [`src/components/`](../src/components) | UI components, grouped by feature: `Map/` (OpenLayers forecast/verification maps, legend, overlay controls), `DrawingTools/`, `IntegratedToolbar/`, `ForecastWorkspace/`, `DaySelector/`, `OutlookSelector/`, `OutlookPanel/`, `DiscussionEditor/`, `CycleManager/`, `CloudCycleManager/`, `Verification/`, `VerificationMode/`, `Monitor/`, `Layout/`, `Beta/`, `ui/` (Radix-based primitives), `ToS/`, `PrivacyPolicy/`, `AlertBanner*`, `Toast/`, `Toolbar/`. |
| [`src/pages/`](../src/pages) | One file per route; `src/pages/home/` holds homepage sections. |
| [`src/hooks/`](../src/hooks) | App-wide React hooks (auto-save, auto-categorical, cloud sync, file loader, sleep recovery). |
| [`src/utils/`](../src/utils) | Pure, heavily unit-tested logic: file serialize/validate (`fileUtils.ts`), outlook/color logic (`outlookUtils.ts`), map export (`exportUtils.ts`), verification analysis (`verificationUtils.ts`), storm-report parsing, analytics/metrics helpers. |
| [`src/lib/`](../src/lib) | Firebase init (`firebase.ts`), cloud-cycles service, beta access helpers, OpenFreeMap style loading, UI constants. |
| [`src/config/`](../src/config) | Build-target resolver (`buildTarget.ts`). |
| [`src/types/`](../src/types) | Domain types: `outlooks.ts`, `stormReports.ts`, `cloudCycles.ts`. |
| [`src/maps/`](../src/maps) | Map engine contract/adapters (`contracts.ts`). |
| [`src/monitor/`](../src/monitor) | Monitor feature domain logic: WMS layer config (`wms.ts`), NWS alerts (`nwsAlerts.ts`), radar sites, outlook sources, storm-report styling. |
| [`src/metrics/`](../src/metrics) | `useUserMetrics` for the account page. |
| [`src/content/`](../src/content) | Release-note content model (`updates/v1.6.ts`). |
| [`src/auth/`](../src/auth), [`src/billing/`](../src/billing) | Auth context and Stripe entitlements. |

### Key libraries

`react` / `react-dom` 19, `@reduxjs/toolkit` + `react-redux`, `react-router-dom` 7, OpenLayers (`ol`) for all interactive maps, `leaflet` only for static PNG export, `@turf/turf` for geometry (union/intersect/hit-miss), `firebase` for auth/Firestore, `@sentry/react` for error monitoring, `immer` for state, `jszip`/`html2canvas` for exports. Full list in [`package.json`](../package.json).

---

## Server entry points and routes

The server is the `gfc-analytics` package ([`server/package.json`](../server/package.json)). It is a single Express app bound to `127.0.0.1` and fronted by nginx; it is never exposed directly.

- **Entry point:** [`server/analytics.js`](../server/analytics.js) — loads env, initializes Sentry, builds the app via `configureApp`, listens on `PORT` (default `3006`).
- **App assembly:** [`server/analytics-app.js`](../server/analytics-app.js) — `configureApp` registers all route modules plus the raw `POST /collect` endpoint, adds the Sentry error handler, and a 404 catch-all.

| Method | Path | Module | Purpose |
|--------|------|--------|---------|
| `POST` | `/collect` | [`analytics-app.js`](../server/analytics-app.js) | Page-view analytics ingestion → JSONL log file. |
| `POST` | `/api/sentry-tunnel` | [`sentry-tunnel.js`](../server/sentry-tunnel.js) | Proxies browser Sentry envelopes (ad-blocker bypass). |
| `GET` | `/api/billing/config` | [`billing.js`](../server/billing.js) | Public billing config for the client. |
| `POST` | `/api/billing/webhook` | [`billing.js`](../server/billing.js) | Stripe webhook receiver (signature-verified). |
| `POST` | `/api/billing/checkout` | [`billing.js`](../server/billing.js) | Creates a Stripe Checkout session. |
| `POST` | `/api/billing/portal` | [`billing.js`](../server/billing.js) | Opens the Stripe billing portal. |
| `POST` | `/api/metrics/event` | [`metrics.js`](../server/metrics.js) | Product metrics ingestion (Firestore-backed). |
| `GET` | `/api/admin/metrics` | [`metrics.js`](../server/metrics.js) | Private admin metrics dashboard data (token + allowlist gated). |
| `POST` | `/api/beta/claim` | [`beta.js`](../server/beta.js) | Beta invite claim (writes `betaAccess`). |
| `POST` | `/api/account/delete` | [`account-lifecycle.js`](../server/account-lifecycle.js) | Full account deletion (Firestore sweep + Stripe + Firebase identity). |

Supporting modules:

- [`server/billing-config.js`](../server/billing-config.js) — env-driven billing configuration (prices, promo windows, runtime gates).
- [`server/billing-stripe-period.js`](../server/billing-stripe-period.js) — Stripe API version compatibility for period-end parsing.
- [`server/billing-webhook-state.js`](../server/billing-webhook-state.js) — idempotency/staleness ledger for entitlement webhook writes.
- [`server/firebase-admin.js`](../server/firebase-admin.js) — lazy Firebase Admin singleton (auth + Firestore).
- [`server/sentry.js`](../server/sentry.js) — `initSentry()` + Express error handler.
- [`server/load-env.js`](../server/load-env.js) — env loading.
- [`server/view-analytics.js`](../server/view-analytics.js) — CLI summary of the analytics log.
- [`server/lib/production-release.mjs`](../server/lib/production-release.mjs) + [`server/lib/production-release/`](../server/lib/production-release) — pure ESM logic for the timed production rollout manifest (constants, schedule, banner, normalize, validators).
- [`server/release/`](../server/release) — VPS rollout tooling: [`check-rollout.mjs`](../server/release/check-rollout.mjs) (cron entry), [`promote-release.sh`](../server/release/promote-release.sh), `mark-release-*.mjs`, `read-manifest-fields.mjs`, `assert-rollout-ready.mjs`, `write-live-alert-banner.mjs`.
- [`server/nginx.conf`](../server/nginx.conf) / [`server/nginx-staging.conf`](../server/nginx-staging.conf) — production/staging nginx configs (SPA fallback + `/api` reverse proxy).

---

## Storage and hosted services

- **Firebase** — client config in [`src/lib/firebase.ts`](../src/lib/firebase.ts); Admin SDK in [`server/firebase-admin.js`](../server/firebase-admin.js). Firestore collections: `userSettings`, `userProfiles`, `userEntitlements`, `cloudCycles`, `userMetrics`, plus admin collections and deletion/tombstone markers. Authorization is enforced by [`firestore.rules`](../firestore.rules) (deployed manually — see [`docs/operations/firestore-rules-deployment.md`](operations/firestore-rules-deployment.md)). Emulator config in [`firebase.json`](../firebase.json).
- **Stripe** — checkout, billing portal, and webhooks handled by [`server/billing.js`](../server/billing.js); entitlements land in `userEntitlements/{uid}`.
- **Sentry** — browser SDK in [`src/instrument.ts`](../src/instrument.ts) with the nginx/Sentry tunnel; server-side in [`server/sentry.js`](../server/sentry.js).
- **External weather data** — SPC storm-report CSV parsing (`src/utils/stormReportParser.ts`), NWS active alerts (`src/monitor/nwsAlerts.ts`), NWS radar sites, and MRMS/GOES WMS layers (`src/monitor/wms.ts`).
- **Static map data** — county warning-area boundaries in [`public/cwa-boundaries.json`](../public/cwa-boundaries.json); vector base-map styles loaded via OpenFreeMap (`src/lib/openFreeMap.ts`).

---

## Build / CI / deployment

### Build

- [`vite.config.ts`](../vite.config.ts) — React + optional Sentry sourcemap upload; build-time `__GFC_*` defines (app version, build target, coming-soon/beta flags, Firebase and Sentry config); `/api` dev proxy to `127.0.0.1:3006`; `@` alias → `src`.
- [`src/config/buildTarget.ts`](../src/config/buildTarget.ts) — resolves `VITE_BUILD_TARGET` (`local` | `beta` | `staging` | `production`).
- Test tooling: [`jest.config.js`](../jest.config.js) (Jest 30, jsdom, ts-jest + babel-jest), [`babel.config.js`](../babel.config.js), [`playwright.config.ts`](../playwright.config.ts), [`postcss.config.js`](../postcss.config.js), [`tailwind.compat.config.js`](../tailwind.compat.config.js), [`tsconfig.json`](../tsconfig.json).

### CI workflows (`.github/workflows/`)

| Workflow | What it does |
|----------|--------------|
| [`ci.yml`](../.github/workflows/ci.yml) | Required checks: branch policy, port policy, changelog gate, release-manifest validation, package-version policy, Firestore rules emulator suite, `pnpm run build` + Jest on Node 22/24/25, and server `npm test`. |
| [`pr-governance.yml`](../.github/workflows/pr-governance.yml) | Applies/refreshes PR labels (routing, component, content, changelog, CI status). |
| [`post-merge-automation.yml`](../.github/workflows/post-merge-automation.yml) | Versions + GitHub Releases after merges to `main`/`beta`. |
| [`pr-porting.yml`](../.github/workflows/pr-porting.yml) | Automates `main` → `beta` porting (`.github/scripts/port-changes.sh`). |
| [`deploy-main-to-vps.yml`](../.github/workflows/deploy-main-to-vps.yml) | Builds and deploys the stable release to the production VPS (with optional timed `stage` + cron promote). |
| [`deploy-beta.yml`](../.github/workflows/deploy-beta.yml) | Deploys beta prereleases to the beta VPS surface. |
| [`prepare-beta-main-release-pr.yml`](../.github/workflows/prepare-beta-main-release-pr.yml), [`promote-beta-to-main.yml`](../.github/workflows/promote-beta-to-main.yml), [`bump-beta-after-main-release.yml`](../.github/workflows/bump-beta-after-main-release.yml) | Optional/legacy release-branch helpers. |
| [`cleanup-port-branches.yml`](../.github/workflows/cleanup-port-branches.yml), [`dependabot-changelog.yml`](../.github/workflows/dependabot-changelog.yml) | Housekeeping. |

### Deployment and release

- **Hosting:** static SPA + nginx + PM2 on a VPS (`gfc.weatherboysuper.com`, `beta-gfc.weatherboysuper.com`, `staging-gfc.weatherboysuper.com`). See [`server/nginx.conf`](../server/nginx.conf) and [`docs/hosted-rollout.md`](hosted-rollout.md).
- **Timed rollout:** `deploy/production-release.json` manifest drives `stage`/`promote`/`live`; VPS cron runs [`server/release/check-rollout.mjs`](../server/release/check-rollout.mjs). See [`docs/timed-production-rollout.md`](timed-production-rollout.md).
- **Release workflow:** merge → automation bumps version + creates GitHub Release → deploy workflows fire. See [`docs/release-workflow.md`](release-workflow.md).
- **Deploy config:** [`deploy/production-deployment-config.json`](../deploy/production-deployment-config.json) and [`deploy/beta-deployment-config.json`](../deploy/beta-deployment-config.json) supply `serverEnv` overrides (feature toggles) via [`scripts/write-deployment-env.mjs`](../scripts/write-deployment-env.mjs).
- **Version/release automation** lives in [`scripts/`](../scripts) (version bumps, changelog gates, branch/port policy, label computation) with shared logic in [`scripts/lib/`](../scripts/lib).

### Tests

- Jest unit/component tests in `src/` (colocated `*.test.ts(x)`).
- Playwright e2e in [`e2e/`](../e2e) (`smoke`, `navigation`, `ui-interactions`).
- Firestore rules suite in [`tests/firestore.rules.test.mjs`](../tests/firestore.rules.test.mjs).
- Server `node --test` suites in `server/` (`*.test.js`).

---

## Current versus target structure

### Current state (facts)

Everything above is the current state. In short:

- A single Vite SPA (`src/`) plus a companion Express API package (`server/`), sharing a pnpm workspace at the repository root.
- Client-side Redux for app/document state, React context for auth/entitlements, OpenLayers as the map engine.
- Firebase (auth + Firestore + entitlements), Stripe (billing), and Sentry (errors) as the hosted backends, fronted by an nginx/PM2 VPS.
- A `beta` → `main` branch model with heavy release/porting automation, a changelog gate, and timed production rollouts.

### Planned structure (future, v1.7 direction)

These are **plans, not facts**. They are tracked separately; do not treat them as describing the current tree.

- Repository documentation is being expanded under the v1.7 tracker ([#434](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/434)): a repository map and architecture overview (this document), concise boundary READMEs for major source and server folders, a local repository inventory and dependency views, and a generated local HTML documentation counterpart.
- Product direction (WarnGen, radar data integration, WxSim game) is captured in [`ROADMAP.md`](../ROADMAP.md) and [`docs/releases/v1.4.0-plan.md`](releases/v1.4.0-plan.md).
- Release-infrastructure evolution (branch model, changelog lanes, deployment gates) is tracked in the migration PR stack.

Facts live in the sections above; anything marked as planned here is subject to change and is out of scope for this document's guarantees.

---

## Contributor pointers

- **Where is the forecast editor?** [`src/pages/ForecastPage.tsx`](../src/pages/ForecastPage.tsx) → map in [`src/components/Map/`](../src/components/Map), toolbar in [`src/components/IntegratedToolbar/`](../src/components/IntegratedToolbar), workspace in [`src/components/ForecastWorkspace/`](../src/components/ForecastWorkspace), state in [`src/store/forecastSlice.ts`](../src/store/forecastSlice.ts).
- **Where is billing?** Client: [`src/billing/`](../src/billing) + [`src/pages/PricingPage.tsx`](../src/pages/PricingPage.tsx); server: [`server/billing*.js`](../server).
- **Where is the Monitor page?** [`src/pages/MonitorPage.tsx`](../src/pages/MonitorPage.tsx), [`src/components/Monitor/`](../src/components/Monitor), [`src/monitor/`](../src/monitor), state in [`src/store/monitorSlice.ts`](../src/store/monitorSlice.ts).
- **Where is verification?** [`src/pages/VerificationPage.tsx`](../src/pages/VerificationPage.tsx), [`src/components/VerificationMode/`](../src/components/VerificationMode), [`src/utils/verificationUtils.ts`](../src/utils/verificationUtils.ts).
- **Where is save/load?** [`src/utils/fileUtils.ts`](../src/utils/fileUtils.ts) (JSON/ZIP serialization), [`src/hooks/useFileLoader.ts`](../src/hooks/useFileLoader.ts), cloud via [`src/lib/cloudCyclesService.ts`](../src/lib/cloudCyclesService.ts).
- **Where are the routes?** [`src/App.tsx`](../src/App.tsx) and [`src/pages/index.ts`](../src/pages/index.ts).
- **Where is the API?** [`server/analytics-app.js`](../server/analytics-app.js) registers every route; each endpoint's module is listed in the [route table](#server-entry-points-and-routes).
- **Where is the release machinery?** [`scripts/`](../scripts), [`docs/release-workflow.md`](release-workflow.md), [`docs/timed-production-rollout.md`](timed-production-rollout.md), and [`deploy/`](../deploy).
