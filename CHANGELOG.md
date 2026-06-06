# Changelog
<!-- markdownlint-disable -->

All notable changes to this project will be documented in this file.

## v1.7.0-beta.1

### Dependencies
- **qs:** ^6.14.2 → ^6.15.2 (override; `server` and root)

### Fixed
- **GFC-WEB-B (Auth Persistence):** Explicitly set `browserLocalPersistence` for Firebase Auth to prevent session drops.
- **GFC-WEB-A (Firestore Sync):** Aggressive background network disconnection now waits for pending writes and uses a serialized transition pattern to prevent race conditions.
- **qs DoS in `stringify` (Dependabot #125):** Bumped `qs` to `^6.15.2` in root and analytics server to resolve the array-format DoS vulnerability.

## v1.6

### Dependencies
<!-- dependabot-automation -->

- **express-rate-limit:** ^8.5.1 → ^8.5.2 (`server`)
- **express:** ^4.21.2 → ^5.2.1 (`server`)
- **stripe:** ^22.1.1 → ^22.2.0 (`server`)
- **@types/node:** ^25.5.0 → ^25.9.1
- **@types/react-dom:** 18.2.18 → 19.2.3
- **immer:** ^11.1.4 → ^11.1.8
- **react-redux:** ^9.2.0 → ^9.3.0
- **react-router-dom:** ^7.15.1 → ^7.16.0
- **rollup:** >=4.61.0 → >=4.61.0
- **@babel/core:** ^7.29.0 → ^7.29.7
- **@babel/preset-env:** ^7.29.2 → ^7.29.7
- **@babel/preset-react:** ^7.28.5 → ^7.29.7
- **@babel/preset-typescript:** ^7.28.5 → ^7.29.7
- **ts-jest:** ^29.4.9 → ^29.4.11
- **vite:** ^8.0.14 → ^8.0.16
- **@sentry/react:** ^10.53.1 → ^10.56.0
- **@types/react:** 19.2.15 → 19.2.16
- **firebase:** ^12.12.0 → ^12.14.0
- **lucide-react:** ^1.17.0 → ^1.17.0
- **react:** ^19.2.6 → ^19.2.7
- **react-dom:** ^19.2.6 → ^19.2.7
- **web-vitals:** ^5.2.0 → ^5.3.0
- **@sentry/node:** ^10.53.1 → ^10.56.0 (`server`)

### Added
- **Monitor (`/monitor`):** Live weather workspace with radar and satellite WMS layers (site and composite modes, opacity, animation speed), read-only overlay of the active forecast cycle / saved local cycles / premium cloud library outlooks, NWS watches-warnings-advisories layer, and storm reports with hazard filters plus optional outlook-type matching. Redux `monitorSlice`, `MonitorControls` / `MonitorMap`, premium settings sync via `usePremiumMonitorSettingsSync`, and navbar route with shortcut.
- **Monitor — NWS alerts & storm reports:** `useMonitorNwsAlerts` and `useMonitorStormReports` integrations, panel toggles, and map rendering for alert polygons and report markers.
- **Monitor — outlook on map:** `buildMonitorOutlookOptions`, cloud outlook fetch hook, and OpenLayers outlook layer styling aligned with forecast outlook types.
- **What's New page:** Public `/updates` route with v1.6 copy in `src/content/updates/v1.6.ts` and screenshot directory `public/updates/v1.6/` (hero promo image and section screenshots as assets are added).
- **What's New navigation:** Navbar Resources overflow menu links to `/updates` so the release page is discoverable without typing the URL.
- **What's New images:** Release screenshots open in a full-size lightbox when clicked so promo and section images remain readable on narrow layouts.

### Changed
- **Release automation:** Post-merge beta bump after `main` releases no longer resets an in-progress beta line when `main` is still on an older stable (e.g. `1.5.3` infra merge while beta stays on `1.6.0-beta.N`). New `X.Y.0-beta.1` only after a real promotion of that line.
- **Alert banner tests:** Repair corrupted `AlertBanner.test.tsx` from release sync (syntax error and broken dismissible test).
- **Analytics server:** Land Express 5 and Stripe Node 22 on beta (`server/analytics.js` / `configureApp`) and shared smoke-test app wiring for CodeQL rate-limit coverage on `/collect`.
- **Alert banner:** Optional `linkUrl` / `linkLabel`, `startsAt` / `expiresAt` scheduling, and `id` on `public/alert-banner.json`; client normalizes config in `alertBannerConfig.ts`. See `docs/alert-banner.md`.


### Fixed
- **Monitor radar/satellite after theme change:** Keep the OpenLayers map mounted when toggling light/dark mode (update basemap tiles only) and re-apply WMS layers on theme changes so satellite and radar imagery no longer disappear or show “Latest time unavailable” until a full page refresh.
- **GFC-WEB-8 (beta routes after `/updates` split):** `BetaAccessGuard` forwards `AppLayout` outlet context so home, forecast, and other guarded routes can destructure `addToast` again.
- **Signed-in home (light mode):** Primary gradient “Resume Forecast” buttons use white text instead of `#067aff` on the concept home layout (`.home-concept-top-primary`, `.home-concept-action-primary`).
- **Analytics server tests:** Share `configureApp` with production so `/collect` stays rate-limited in server smoke tests (fixes CodeQL `js/missing-rate-limiting` on `beta`).
- **Analytics server (beta):** Restored a broken partial merge in `server/analytics.js` so the hosted collector starts again before Express 5 / Stripe 22 land.
- **Stripe subscription webhooks:** Read `current_period_end` from subscription items for Stripe API 2025-03-31+ (stripe-node v22) with fallback for older payloads.
- **Map layer transparency:** Restored `transparencyScale` on forecast map fill/stroke opacity after the main sync dropped the multiplier (fixes CI on `beta`).
- **OpenLayers popups:** Avoid `removeChild` NotFoundError when React popup nodes are moved during map teardown.
- **Forecast keyboard shortcuts (GFC-WEB-3):** Ignore `keydown` events where the browser omits `KeyboardEvent.key` (Sentry on `/forecast`) instead of throwing when normalizing the key for shortcuts. Centralized the guard in `keyboardShortcutKey` and applied it to forecast, navbar, and day-selector shortcuts.
- **Safari overnight IndexedDB disconnects:** Switched hosted Firestore to an in-memory local cache so Safari/macOS sleep no longer hits WebKit’s “Connection to Indexed Database server lost” error from Firestore’s default IndexedDB persistence. Pauses Firestore network sync while the tab is hidden and resumes it on wake to reduce failures on long-lived forecast editor tabs.
- **GFC-WEB-6 (auto-save/export crash):** Added runtime guards in `mapToArray` and `arrayToMap` so `serializeForecast`/`deserializeForecast` return fallback values instead of crashing when `OutlookData` Map fields are plain objects at runtime.
- **GFC-WEB-7 (auto-categorical crash):** Coerce legacy plain-object probability maps to `Map` before auto-categorical iteration so `/forecast` no longer throws `forEach is not a function` when loading old saved cycles from localStorage.
## v1.5.3
