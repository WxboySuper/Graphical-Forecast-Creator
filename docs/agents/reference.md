# Lookup tables

Facts verified against the code on 2026-11-08 (v2 beta 6). Re-verify with grep before relying on a value; the code wins.

## Routes (`src/App.tsx`)

| Path | Page | Notes |
|------|------|-------|
| `/` | `HomePage` | `*` redirects to `/`; retired `/beta` and `/beta-access/*` links also redirect to `/` |
| `/forecast`, `/forecast/<workspace>` | `ForecastPage` | Workspaces from `src/routing/forecastWorkspaceRoutes.ts`; legacy `?workspace=` handled there. Contract: [workspace boundaries](../architecture/forecast-workspace-boundaries.md) |
| `/discussion`, `/verification`, `/monitor` | lazy pages | `Suspense` + `RouteFallback` |
| `/account`, `/pricing`, `/cloud`, `/admin`, `/updates` | account, pricing, cloud library, admin metrics, release notes | `/updates` has an nginx exact-match rule (`server/nginx.conf`) |
| `/dev/feature-exposure` | `FeatureExposureDiagnosticsPage` | dev diagnostics |
| gated | built by `src/routing/buildFeatureGatedRoutes.tsx` | e.g. `/tropical`, `/collaborate`; absent when disabled |

## Redux slices (`src/store`)

`appModeSlice`, `forecastSlice` (+ `forecastSliceSelectors`, `forecastSliceWorkspaceHelpers`, custom layer/category/feature reducers, cycle hydration/copy/completion/blank-cycle helpers), `verificationSlice`, `monitorSlice`, `stormReportsSlice`, `overlaysSlice`, `themeSlice`. Rules: [deterministic transitions](../architecture/deterministic-redux-transitions.md); reducers pure; Immer configured in `src/immerSetup.ts`.

## Core types (`src/types/outlooks.ts`)

`OutlookType = tornado|wind|hail|categorical|totalSevere|day4-8`; `DayType = 1..8`; `DiscussionMode = diy|guided`. Shapes: `OutlookData`, `OutlookDay`, `ForecastCycle`, `GFCForecastSaveData` (the exported JSON), `DiscussionData`. Persisted/imported data must pass strict validation (custom layers: `src/lib/customProducts.ts`).

## Server API (`server/`)

| Route | Auth | Source |
|-------|------|--------|
| `GET /` | none | health |
| `GET /api/capabilities/status` | none | capability status (exact shape locked by tests) |
| `GET /api/billing/config` | none | public billing config |
| `POST /api/billing/checkout`, `/portal` | Firebase ID token | `billingRoutes.js` |
| `POST /api/billing/webhook` | Stripe signature | `billing-webhook-state.js` |
| `POST /api/cloud-cycles` | Firebase token + entitlement | `cloud-cycles.js` |
| `POST /api/account/delete` | Firebase token | `account-lifecycle.js` |
| `POST /api/metrics/event` | device/account | `metricsRoutes.js` |
| `GET /api/admin/metrics` | `ADMIN_UID_ALLOWLIST` | `metricsAdminReads.js` |
| `POST /api/sentry-tunnel` | none (validates DSN) | `sentry-tunnel.js` |
| `GET /api/tstm/latest`, `/status` | none, capability-gated | `tstm.js` |

Python Auto-TSTM generator: `server/weather/` (tests: `python -m unittest discover -s server/weather -p 'test_*.py'`, deps `server/requirements.txt`).

## Firestore (`firestore.rules`, hostile-client tested)

`userProfiles/{uid}`, `userSettings/{uid}`, `userEntitlements/{uid}` (server-written), `serverFeatureCapabilities/{id}`, `userMetrics/{uid}`, `users/{uid}/workflowAwareness/{cycleId}`, `users/{uid}/customProducts/{slot}` (20 fixed slots `product-01..20`), `cloudCycles/{id}` + `/payload/payload`, `adminDailyMetrics`, `adminMetricDedupes`; everything else denied. Deploy/verify: [rules deployment](../operations/firestore-rules-deployment.md).

## Limits seen in code

`MAX_CLOUD_CYCLES = 100` per user, `MAX_PAYLOAD_BYTES = 750000` per cloud cycle, `MAX_DAILY_DEVICES_PER_ACCOUNT = 5`, custom products 20 slots, 1-12 categories per custom layer. JS budget in CI: entry chunk 450 kB, all chunks 3.5 MB (`scripts/check-bundle-budget.mjs`).

## Browser storage keys

`forecastData` (+ `:user-<id>`, `:custom`, `:mesoscale` variants), `gfc-cycle-history` (+ user-scoped, `-claim`), `gfc-active-forecast-workflow`, `gfc-monitor-settings`, `gfc-forecast-ui-variant`, `gfc-last-active-local-day`, `gfc-completion-handoff-handled`, `darkMode`, `gfcInstallationId`, `gfc-analytics-enabled`, `gfc-workflow-analytics-enabled`, `gfc-privacy-policy-accepted`, `gfc-tos-accepted`, dev-only `gfc-local-beta-bypass`, `gfc-local-test-account`. Changing a key or its shape needs migration/compat handling and a note in the relevant doc.

## Environment variables (names only)

Client (build-time, `VITE_*`): `VITE_BUILD_TARGET`, `VITE_FEEDBACK_API_URL`, `VITE_MESOSCALE_WORKER_URL` or `VITE_MESOSCALE_WORKER_URL_{LOCAL,BETA,STAGING,PRODUCTION}`, `VITE_MESOSCALE_FIXTURES`, `VITE_MESOSCALE_DEMO` (local only), `VITE_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,APP_ID}`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_UMAMI_{HOST,BETA_WEBSITE_ID,PRODUCTION_WEBSITE_ID}`. Anything `VITE_*` ships to the browser: never put secrets there.

Server: `PORT`, `SERVER_TARGET`, `APP_BASE_URL` (`https://app.gfcweather.com` in production), `BETA_WORKER_SHARED_SECRET`, `PRODUCTION_WORKER_SHARED_SECRET`, `ADMIN_UID_ALLOWLIST`, `METRICS_HASH_SALT`, `FIREBASE_ADMIN_{PROJECT_ID,CLIENT_EMAIL,PRIVATE_KEY}`, `STRIPE_{SECRET_KEY,WEBHOOK_SECRET,PRICE_MONTHLY,PRICE_ANNUAL_STANDARD,PRICE_ANNUAL_PROMO,PROMO_START,PROMO_END}`, `SENTRY_{DSN,BROWSER_DSN,ENVIRONMENT,RELEASE,TRACES_SAMPLE_RATE}`, plus capability switches `TSTM_GENERATION_ENABLED`, `TSTM_INGESTION_ENABLED`, `EMERGENCY_DISABLED_CAPABILITIES`. Loaded by `server/load-env.js`; deploy env written by `scripts/write-deployment-env.mjs`. Browser API requests use the app Worker. Keep `https://app.gfcweather.com` and `https://gfcweather.com` in Worker CORS origin lists during the hostname transition.

## GitHub

- Milestones: `v2` (current), `Future Features`.
- Labels in use: type (`Bug`, `Enhancement`, `Feature`, `Refactor`, `Documentation`, `Accessibility`, `Performance`), area (`Component: Map|Outlooks|Drawing-Tools|Export|UI|Storage`), priority (`P0`-`P2`, `Priority: *`), `Emergency`, `dependencies`, plus automation labels (`opencode-audit`, `opencode-audit-eligible`, `porting/conflicts`). Several roadmap-style labels (`reliability`, `ecosystem`, ...) come from another project's template and are unused; ignore them. The `Component: Map` description still says Leaflet; the map is OpenLayers.
- `main` has **no branch protection rule** (API returned 404); required checks are enforced by workflow policy and review habit, not GitHub settings. Do not assume a red check blocks the merge button.
