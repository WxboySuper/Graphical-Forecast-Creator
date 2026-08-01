# Repository Map and Architecture Overview

This document maps the **current-state** repository layout and architecture so contributors can locate major behavior quickly. It is intentionally a snapshot: it records what exists today, and it lists forward-looking plans in a separate section so facts and plans stay distinct.

- Facts (what the code does today) live in sections [1](#1-repository-layout-at-a-glance) through [5](#5-build-ci-and-deployment).
- Plans (what v1.7 intends to change) live only in [6](#6-current-versus-target-structure).
- The [appendix](#appendix-where-major-behavior-lives) is a behavior-to-file index.

The repo is a single repository with two packages: the React frontend at the root (`package.json`) and the hosted-services Node server under `server/` (`server/package.json`). There is no shared workspace tooling; each package installs and builds independently.

---

## 1. Repository layout at a glance

```
.
├── AGENTS.md                    # Operating-mode and workflow rules for agents/contributors
├── README.md                    # Feature overview, scripts, build targets
├── ROADMAP.md                   # Version history and future milestones
├── CHANGELOG.md                 # Release history
├── package.json                 # Frontend package (React + Vite)
├── pnpm-lock.yaml
├── index.html                   # Browser entry HTML
├── vite.config.ts               # Vite build + env define + dev proxy
├── jest.config.js               # Frontend unit tests
├── playwright.config.ts         # E2E tests
├── firebase.json                # Firestore emulator config
├── firestore.rules              # Firestore security rules
├── src/                         # Frontend source
├── server/                      # Node hosted-services package (Express)
├── public/                      # Static assets served verbatim (CNAME, alert banner, map data)
├── e2e/                         # Playwright end-to-end tests
├── tests/                       # Non-jest tests (Firestore rules)
├── scripts/                     # Release/CI automation (Node)
├── deploy/                      # Deployment manifests and env configs
├── docs/                        # Markdown documentation
└── .github/
    ├── workflows/               # CI + deployment + release automation
    └── scripts/                 # Shared shell helpers for automation
```

---

## 2. Frontend entry points and data flow

### Entry chain

`index.html` → `src/index.tsx` → `src/App.tsx`.

- `src/index.tsx` creates the React 19 root, wires Sentry error handlers (see `src/instrument.ts`), calls `setupCycleHistoryListener`, `reportWebVitals`, and `trackPageView`.
- `src/App.tsx` composes the provider tree and defines routing:

```
Provider (Redux)
└── AuthProvider            # Firebase auth + per-user settings sync
    └── EntitlementProvider # Stripe/premium entitlement UX
        └── BrowserRouter
            └── AgreementGate   # ToS + privacy acceptance flow
            └── AppRoutes
```

`AppRoutes` registers every route. The launch gate (`useLaunchGate` + `__GFC_COMING_SOON__`) shows `ComingSoonPage` before the configured launch time; `AppHooks` runs cross-cutting hooks (`useAutoCategorical`, `useAutoSave`, `useFirestoreSleepRecovery`, `useCycleHistoryPersistence`, feature-flag initialization).

### Routes

| Path | Page | Purpose |
|------|------|---------|
| `/beta` | `BetaLandingPage` | Public beta landing |
| `/beta-access/:invitePath?` | `BetaInvitePage` | Invite-gated beta access |
| `/` | `HomePage` | Landing / cycle overview |
| `/forecast` | `ForecastPage` | Main outlook editing (map is the primary workspace) |
| `/discussion` | `DiscussionPage` | Forecast discussion editor |
| `/verification` | `VerificationPage` | Storm-report verification |
| `/monitor` | `MonitorPage` | Live radar/NWS-alert monitor |
| `/account` | `AccountPage` | Account + billing management |
| `/pricing` | `PricingPage` | Plan pricing |
| `/admin` | `AdminPage` | Private admin metrics dashboard |
| `/cloud` | `CloudLibraryPage` | Premium hosted cloud cycle library |
| `/updates` | `UpdatesPage` | In-app changelog/updates |

Pages behind `BetaAccessGuard` (all except `/updates`) require beta access when a hosted beta gate is active. Route/page declarations live in `src/App.tsx` and the barrel export `src/pages/index.ts`.

### State management

Redux Toolkit store in `src/store/index.ts` with slices:

| Slice | File | Holds |
|-------|------|-------|
| `forecast` | `src/store/forecastSlice.ts` | Active forecast, per-day outlook data, undo/redo history |
| `verification` | `src/store/verificationSlice.ts` | Isolated verification state |
| `overlays` | `src/store/overlaysSlice.ts` | Map overlay toggles |
| `theme` | `src/store/themeSlice.ts` | Light/dark theme |
| `featureFlags` | `src/store/featureFlagsSlice.ts` | Outlook feature flags |
| `appMode` | `src/store/appModeSlice.ts` | App mode (normal/emergency) |
| `stormReports` | `src/store/stormReportsSlice.ts` | Loaded storm reports |
| `monitor` | `src/store/monitorSlice.ts` | Monitor/radar settings |

The store serializability check whitelists the in-memory `Map`-based outlook structures.

### Data flow (forecast editing)

1. User draws/edits polygons on the OpenLayers map (`src/components/Map/OpenLayersForecastMap.tsx`).
2. Changes dispatch Redux actions into the `forecast` slice.
3. `useAutoSave` (`src/hooks/useAutoSave.ts`) persists the cycle to `localStorage` every 5 seconds; `useCycleHistoryPersistence` restores the session on reload.
4. `useAutoCategorical` derives the categorical outlook from the probabilistic outlooks.
5. For premium users, `useCloudSync` / `useCloudCycles` push cycles to Firestore via `src/lib/cloudCyclesService.ts` (`cloudCycles` collection).

### Key utilities

- `src/utils/fileUtils.ts` — JSON schema validation, import/export, ZIP package.
- `src/utils/exportUtils.ts` — map image capture (html2canvas) and export.
- `src/utils/outlookUtils.ts` — risk colors and categorical conversion rules.
- `src/utils/verificationUtils.ts` — storm-report spatial hit/miss analysis.
- `src/utils/analyticsUtils.ts` — anonymous page-view beacon to `/api/collect`.
- `src/utils/forecastMetrics.ts`, `src/utils/productMetrics.ts` — usage/product metrics.

### Maps

The forecast and verification maps use **OpenLayers** (`ol`) under `src/components/Map/`. The monitor builds its own OpenLayers maps under `src/components/Monitor/` and `src/monitor/`, consuming live WMS radar (NOAA `opengeo.ncep.noaa.gov`), satellite (NOAA `nowcoast`), NWS active alerts (`api.weather.gov`), and radar-site WFS data. The legacy Leaflet CSS import in `src/App.tsx` is vestigial; Leaflet is no longer the active map engine.

---

## 3. Server entry points and routes

The server is a single Express application in `server/`, written in CommonJS and run under `pm2` on the VPS. It is **not** a full backend for the app — it hosts the hosted-service endpoints (analytics, billing, metrics, beta invites, account deletion, Sentry tunneling).

### Entry

- `server/analytics.js` — loads env (`server/load-env.js`), initializes Sentry, builds the Express app via `configureApp`, and binds to `127.0.0.1:PORT` (loopback only; nginx proxies `/api/*` in). Default port 3006.
- `server/analytics-app.js` — `configureApp` registers rate limits, all route modules, the `/collect` handler, Sentry error handler, and a quiet 404 fallback.

### Route table

| Method + path | Handler | Purpose |
|---------------|---------|---------|
| `POST /collect` | `server/analytics-app.js` | Anonymous page-view beacon (nginx maps `/api/collect` → `/collect`) |
| `POST /api/sentry-tunnel` | `server/sentry-tunnel.js` | Proxies browser Sentry envelopes past ad blockers |
| `GET /api/billing/config` | `server/billing.js` | Public billing configuration |
| `POST /api/billing/webhook` | `server/billing.js` | Stripe webhooks (checkout, subscription, invoice) |
| `POST /api/billing/checkout` | `server/billing.js` | Create Stripe checkout session |
| `POST /api/billing/portal` | `server/billing.js` | Open Stripe billing portal |
| `POST /api/metrics/event` | `server/metrics.js` | Anonymous product metrics (hashed IDs) |
| `GET /api/admin/metrics` | `server/metrics.js` | Admin dashboard metrics |
| `POST /api/beta/claim` | `server/beta.js` | Beta invite claim |
| `POST /api/account/delete` | `server/account-lifecycle.js` | Full account deletion (auth + Firestore + Stripe) |
| `*` | `server/analytics-app.js` | `404` fallback |

### Supporting modules

| Module | Purpose |
|--------|---------|
| `server/firebase-admin.js` | Firebase Admin init (auth + Firestore) |
| `server/billing-config.js` | Billing runtime config, price IDs, promo windows |
| `server/billing-stripe-period.js` | Stripe subscription period helpers |
| `server/billing-webhook-state.js` | Webhook state normalization |
| `server/sentry.js` | Server Sentry init + error handler |
| `server/load-env.js` | Loads `.env` from the deployment config |
| `server/view-analytics.js` | Reads the raw analytics log |
| `server/nginx.conf`, `server/nginx-staging.conf` | Reference nginx configs for production/staging |

`server/release/` holds the timed-rollout lifecycle scripts (`assert-rollout-ready`, `check-rollout`, `mark-release-live`, `mark-release-staged`, `promote-release.sh`, `write-live-alert-banner`) driven by the production deploy workflow. Server unit tests use Node's built-in test runner (`server/*.test.js`) and run via `npm test` in `server/`.

---

## 4. Storage and hosted services

### Firebase (hosted)

- **Auth** — Google, GitHub, and email/password via the Firebase web SDK. Client setup in `src/lib/firebase.ts`; session management and per-user settings sync in `src/auth/AuthProvider.tsx`. The web SDK config is injected at build time from `VITE_FIREBASE_*` env vars.
- **Firestore** — security rules in `firestore.rules`, enforced against a local emulator by `tests/firestore.rules.test.mjs` (`pnpm test:firestore-rules`). Collections:

| Collection | Owned by | Purpose |
|------------|----------|---------|
| `userProfiles` | client | Public profile fields |
| `userSettings` | client | Settings + legacy cloud-cycle migration target |
| `userEntitlements` | server (Firebase Admin) | Premium entitlement records written from Stripe state |
| `userMetrics` | client | Progress-first account metrics |
| `cloudCycles` | client | Premium hosted forecast-cycle library |
| `adminDailyMetrics` | server | Aggregated admin metrics |
| `adminMetricDedupes` | server | Admin metric dedupe keys |

The client uses an in-memory local cache (`memoryLocalCache`) rather than IndexedDB persistence to avoid Safari sleep-related invalidation (see `src/hooks/useFirestoreSleepRecovery.ts`).

### Stripe

Billing is **server-side only**. The web client calls `POST /api/billing/checkout` and `/api/billing/portal`; Stripe webhooks arrive at `/api/billing/webhook`. The server verifies the Firebase ID token, creates sessions, validates webhook signatures, and writes entitlement state to `userEntitlements` via Firebase Admin. Stripe secret keys never reach the browser. See `server/billing.js` and `server/billing-config.js`.

### VPS (nginx + pm2)

Deployment surfaces are served from a VPS (`gfc.weatherboysuper.com` production, `beta-gfc.weatherboysuper.com` beta, `staging-gfc.weatherboysuper.com` staging):

- Static SPA under `/var/www/gfc*` (nginx serves `index.html`, versioned release dirs on production).
- Analytics servers under `/opt/gfc-*` run via pm2 on loopback ports — production `3006`, beta `3007`, staging `3008` — and nginx proxies `/api/*` to them.
- Reference configs: `server/nginx.conf`, `server/nginx-staging.conf`.

### Sentry

Sentry is enabled on hosted builds when `VITE_SENTRY_DSN` is provided; local builds stay inert. Web monitoring (errors, React Router v7 performance traces, Redux breadcrumbs) uses `@sentry/react`; server monitoring uses `@sentry/node`. Events are split by environment (`production` / `beta` / `staging`). Session replay and PII collection are disabled. Source maps are uploaded from the deploy builds.

### Analytics log

Page views and product metrics are appended as JSONL to a local log file on the VPS (`LOG_DIR`/`analytics.log`). No database backs the log; admin metrics are computed from these files with UIDs hashed via `METRICS_HASH_SALT`.

---

## 5. Build, CI, and deployment

### Build (Vite)

- `vite.config.ts` defines compile-time constants from env: build target (`__GFC_BUILD_TARGET__`), app version, Firebase config, Sentry DSN/environment, beta mode flags.
- `src/config/buildTarget.ts` resolves `VITE_BUILD_TARGET` to one of `local`, `beta`, `staging`, `production` (invalid values fail the build).
- Output goes to `build/`; Sentry source maps are uploaded when `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` are present.
- Dev: `pnpm dev` serves on port 3000 and proxies `/api` to the local analytics server on `127.0.0.1:3006`.

### CI (`.github/workflows/ci.yml`)

| Job | What it runs |
|-----|--------------|
| `pr-governance` | Branch policy, port-PR policy, changelog policy, production-release manifest validation |
| `package-version-policy` | Release-automation unit tests + package version validation |
| `firestore-rules` | Firestore emulator rules tests (`pnpm test:firestore-rules`) |
| `build-and-test` | Matrix over Node `22.12.0`, `24.x`, `25.x`: `pnpm run build`, `pnpm test`, then `server/` `npm test` |

### Deployment

Both deploy workflows are currently **manual-only** (`workflow_dispatch`) during the release-architecture migration freeze:

- **`deploy-beta.yml`** — builds with `VITE_BUILD_TARGET=beta` and `PUBLIC_URL=https://beta-gfc.weatherboysuper.com`, rsyncs `build/` to `/var/www/gfc-beta/` and `server/` to `/opt/gfc-beta-analytics/`, writes the beta env file, and restarts `gfc-beta-analytics` (port 3007).
- **`deploy-main-to-vps.yml`** — reads `deploy/production-release.json` for the action (`live`, `stage`, or `none`):
  - `live`: builds `VITE_BUILD_TARGET=production`, syncs to a versioned release dir under `/var/www/gfc/releases/<version>` and `/opt/gfc-analytics/releases/<version>`, swaps the `current` symlink, and restarts `gfc-analytics` (port 3006).
  - `stage`: additionally builds a beta-gated staging preview (`staging-gfc.weatherboysuper.com`, port 3008), writes a derived live-pre alert banner (`scripts/write-derived-alert-banner.mjs`), and marks the release staged for a timed rollout via `server/release/*.mjs`.
  - `none`: no-op.

### Release / promotion automation

| Workflow | Status | Purpose |
|----------|--------|---------|
| `ci.yml` | active | Gatekeeping for all PRs |
| `deploy-beta.yml`, `deploy-main-to-vps.yml` | active (manual) | Deployments |
| `opencode.yml` | active | `/oc` issue/PR automation |
| `post-merge-automation.yml` | **disabled** (migration freeze) | Former post-merge releases/ports |
| `pr-porting.yml` | **disabled** (migration freeze) | Former main → beta porting |
| `promote-beta-to-main.yml` | legacy/emergency only | Direct beta → main promote |
| `prepare-beta-main-release-pr.yml` | optional manual | Creates `release/vX.Y.Z` branch |
| `bump-beta-after-main-release.yml` | optional manual | Bumps beta after a main release |

Deployment manifests and per-target env values live in `deploy/` (`beta-deployment-config.json`, `production-deployment-config.json`, `production-release.json`). Release/port automation lives in `scripts/` and `scripts/lib/` with `scripts/` unit tests run inside the `package-version-policy` CI job. The current release-architecture documentation is `docs/release-workflow.md`.

---

## 6. Current versus target structure

### Current structure (facts)

- Documentation today is a set of standalone Markdown files: `README.md` (with a short "Project Structure" listing), `ROADMAP.md`, `CHANGELOG.md`, `AGENTS.md`, and `docs/` (`Outlook_Info.md`, `release-workflow.md`, `hosted-rollout.md`, `timed-production-rollout.md`, `alert-banner.md`, `operations/`, `prds/`, `releases/`).
- There are **no** per-directory boundary READMEs under `src/` or `server/`.
- There is no generated repository inventory, dependency view, or local HTML documentation site.
- The map in this file is the only dedicated repository/architecture reference.

### Target structure (v1.7 plan — from tracker #434 and its parent)

The v1.7 documentation tracker (`#434`) and its parent (`#425`) plan a structured documentation layer. All of the following are **plans**, not current behavior:

| Item | Issue | Planned deliverable |
|------|-------|---------------------|
| Repository map + architecture overview | #486 (this issue) | `docs/repository-map.md` |
| Boundary READMEs | #487 [DOC-02] | Concise READMEs for major `src/` and `server/` folders |
| Repository inventory + dependency views | #488 [DOC-03] | Generated, exhaustive local inventories and dependency views |
| Local HTML documentation site | #489 [DOC-04] | A rich, ignored local HTML site generated from Markdown and planning data |

The intended end state: contributors can (1) locate major behavior from this map, (2) read a small README at each major folder boundary, (3) consult generated inventories/dependency views for exhaustive detail, and (4) open a local HTML docs site for navigation. That target is documented here as a plan only; none of DOC-02/03/04 are implemented yet.

---

## Appendix: Where major behavior lives

| Behavior | Location |
|----------|----------|
| Bootstrapping / entry | `src/index.tsx`, `src/App.tsx` |
| Routing | `src/App.tsx` (route table), `src/pages/index.ts` (page barrel) |
| Redux store | `src/store/index.ts`, `src/store/*Slice.ts` |
| Forecast editing (map UI) | `src/pages/ForecastPage.tsx`, `src/components/ForecastWorkspace/`, `src/components/Map/` |
| Auto categorical derivation | `src/hooks/useAutoCategorical.ts` |
| Auto-save / session restore | `src/hooks/useAutoSave.ts`, `src/utils/cycleHistoryPersistence.ts` |
| Discussion editor | `src/pages/DiscussionPage.tsx`, `src/components/DiscussionEditor/` |
| Verification | `src/pages/VerificationPage.tsx`, `src/components/Verification/`, `src/utils/verificationUtils.ts` |
| Live monitor (radar/alerts) | `src/pages/MonitorPage.tsx`, `src/components/Monitor/`, `src/monitor/` |
| Cloud cycles / sync | `src/lib/cloudCyclesService.ts`, `src/hooks/useCloudCycles.ts`, `src/hooks/useCloudSync.ts`, `src/pages/CloudLibraryPage.tsx` |
| Auth | `src/lib/firebase.ts`, `src/auth/AuthProvider.tsx` |
| Billing / entitlements | `src/billing/EntitlementProvider.tsx`, `src/pages/PricingPage.tsx`, `src/pages/AccountPage.tsx` |
| Analytics + Sentry instrumentation | `src/instrument.ts`, `src/utils/analyticsUtils.ts`, `src/store/sentryEnhancer.ts` |
| Export / import | `src/utils/fileUtils.ts`, `src/utils/exportUtils.ts` |
| Outlook data model | `src/types/outlooks.ts`, `src/types/stormReports.ts`, `src/types/cloudCycles.ts` |
| Hosted-services server | `server/analytics.js`, `server/analytics-app.js` |
| Billing endpoints | `server/billing.js`, `server/billing-config.js` |
| Metrics / admin | `server/metrics.js`, `src/pages/AdminPage.tsx` |
| Beta invites | `server/beta.js`, `src/lib/betaAccess.ts`, `src/components/Beta/` |
| Account deletion | `server/account-lifecycle.js` |
| Firestore rules | `firestore.rules`, `tests/firestore.rules.test.mjs` |
| Build config | `vite.config.ts`, `src/config/buildTarget.ts` |
| CI gates | `.github/workflows/ci.yml` |
| Deploys | `.github/workflows/deploy-beta.yml`, `.github/workflows/deploy-main-to-vps.yml` |
| Deployment manifests | `deploy/` |
| Release automation | `scripts/`, `scripts/lib/`, `docs/release-workflow.md` |
| E2E tests | `e2e/` |
| Docs | `docs/`, `README.md`, `ROADMAP.md`, `CHANGELOG.md` |

---

## Maintenance notes

- This file describes the **current state**. When you add or move major behavior, update the relevant section and the appendix index in the same PR.
- Keep facts in sections 1–5 and plans in section 6; the v1.7 DOC-01/02/03/04 split is intentional and tracked in #434.
- Relative links in this document must reference real paths; a Jest test (`src/__tests__/docsLinks.test.ts`) enforces that for Markdown links.
