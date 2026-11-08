# Feature exposure and capabilities

Source of truth: `src/config/featureExposure.ts` (registry), `src/config/featureExposure.acknowledgements.json`, `server/lib/serverFeatureExposure.js`, `deploy/*-deployment-config.json`.

## Model

A feature is live iff: registry exposure for the build target (`local|beta|staging|production`) is on, AND for server-backed features the deployment env switch is on (e.g. `TSTM_GENERATION_ENABLED=true`), AND it is not in `EMERGENCY_DISABLED_CAPABILITIES`. Fail closed everywhere.

Capability `reason` values: `available`, `registry_disabled`, `deployment_disabled`, `emergency_disabled`, `unknown`. Public endpoint `GET /api/capabilities/status` returns only `{capabilities:{KEY:{available,reason}}}`; never add fields (see [public-status-schema](../public-status-schema.md)). `GET /api/billing/config` is the other public schema.

## Adding a gated feature

1. Add a registry key with a per-target exposure matrix. Unreleased targets stay **off** until enablement criteria pass.
2. Declare lifecycle: permanent = `temporary: false`, no `removalCondition`; temporary = `temporary: true` + `removalCondition`; optional `trackingIssue`.
3. Gate **before the first exposed slice merges**: routes, nav items, shortcuts, lazy chunks, side-effect modules (`FEATURE_SIDE_EFFECT_MODULES`), `FeatureBoundary` / `useFeatureEffect` / `ServerBackedFeatureBoundary`.
4. Server-backed: `serverCapabilityKey`, server capability gate (return `404`, zero work when disabled), add key to `serverFeatureExposure.js`, set deployment config switch in the config file *on the ref that will be deployed*.
5. Add a disabled-side-effect test or acknowledgement.
6. Mark the PR template exposure checkbox; flipping a target on is its own reviewed change. Removing a temporary feature requires updating `removalCondition` metadata.

Premium rule: if operating the feature costs money (e.g. cloud storage), it is a premium candidate; otherwise free. Core features are always free. Client exposure never bypasses server-owned entitlement checks (`/userEntitlements/{uid}.premiumActive`, Firestore capability flags).

## Required disabled-state proofs

Client-only, for every target: gated routes absent (`assertGatedRoutesAbsent`), nav + shortcuts hidden (`assertNavigationHidden`), lazy chunks not loaded, boundary children/effects not run, no timers/workers/subscriptions/fetches.

Server-backed, additionally: `/api/capabilities/status` not fetched while compile-time exposure is off; routes `404` with zero handler/generator work; emergency, registry, and deployment disables all fail closed.

Harness: `src/testing/featureExposure/` (`targetMatrix.ts`, `harness.tsx`, `exemplar.exposure.test.tsx`) and `server/testing/` (`featureExposureTargetMatrix.js`, `featureExposureHarness.js`, `autoTstm.exposure.test.js`). Filename convention: `src/features/<key>.exposure.test.ts(x)` or `src/features/<key>/<key>.exposure.test.ts(x)`; server-backed features also add a Node test in `server/testing/` using `assertCapabilityRouteRejectsWithoutWork`.

Template and details: [feature-exposure-testing](../operations/feature-exposure-testing.md). Registered workstreams: [feature-exposure-workstreams](../operations/feature-exposure-workstreams.md). Cross-feature matrix (validated by `scripts/validate-feature-exposure.mjs`, do not move): [v1.7-exposure-matrix](../operations/v1.7-exposure-matrix.md).

Commands: `pnpm test:exposure`, `pnpm validate:feature-exposure` (CI job `feature-exposure-policy`), `pnpm exposure:report`, `pnpm exposure:diagnostics`.

## Auto-TSTM (only current server-backed capability)

- Key `autoTstm`, env `TSTM_GENERATION_ENABLED`, ingestion `TSTM_INGESTION_ENABLED`.
- Routes `GET /api/tstm/latest`, `/api/tstm/status`: no auth, 120/min/client, cache-only. Interactive requests never start generators.
- Error `reason`s: `cache_miss`, `cache_stale`, `cache_corrupt` (404), `unavailable` (503). Never leak paths/stderr/stacks.
- Emergency disable: set `EMERGENCY_DISABLED_CAPABILITIES=TSTM_GENERATION_ENABLED` in the host `.env` and restart pm2 (beta: `/opt/gfc-beta-analytics`, process `gfc-beta-analytics`). Disable-only. Stop ingestion with `TSTM_INGESTION_ENABLED=false`. Runbook: [emergency-feature-disable](../operations/emergency-feature-disable.md), ops: [auto-tstm-operations](../operations/auto-tstm-operations.md).
