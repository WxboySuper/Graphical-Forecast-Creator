# Feature flags

Source of truth: `server/flags.json`, read by the client (`src/config/flags.ts`) and the server (`server/lib/flags.js`). Lifecycle script: `pnpm flags`. Deployment env switches live in `deploy/*-deployment-config.json`.

## Model

A flag is a named value per build target (`local`, `beta`, `staging`, `production`). Read it with `flag('name')` on the client (the compiler rejects unknown names) or `resolveFlag('name', target)` on the server. A target with no value written gets the flag's `default`, so production is on only when the entry says so; turning production on is a one-line reviewed diff.

Two kinds, same file:

| Kind | Purpose | Rules |
|------|---------|-------|
| `dev` | Hide unfinished work from production | `default: false`, required `removeBy` version, temporary |
| `switch` | Long-lived kill switch | `default: true` (or a fallback variant), `owner`, one-line `runbook`, permanent |

A value is `true`/`false`, or a string for a variant (the value types must match `default`). A flag with `capability` is server-backed: it is live only if the registry value is on **and** the deployment env switch (`<capability>=true`) is on **and** it is not in `EMERGENCY_DISABLED_CAPABILITIES`. The override can only disable; if it cannot be read, the baked-in value stands. A Workers/KV runtime override is not built yet: `capabilityStatus.js` is the seam.

`GET /api/capabilities/status` returns only `{capabilities:{KEY:{available,reason}}}`; reasons are `available`, `registry_disabled`, `deployment_disabled`, `emergency_disabled`, `unknown`. Never add fields (see [public-status-schema](../public-status-schema.md)).

## Lifecycle

```
pnpm flags                 list flags: kind, owner, per-target values, removeBy, code references, overrides
pnpm flags add <name>      scaffold a dev flag (off except local); adding by hand is one registry line
pnpm flags keep <name>     promote a dev flag to a permanent switch (needs --owner and --runbook, and the flag on everywhere)
pnpm flags retire <name>   remove the flag; the compiler and the printed list show what still names it
pnpm flags check           validate the registry; fails when a dev flag is past its removeBy (CI)
```

## Adding a flag

1. Add one entry to `server/flags.json` (or `pnpm flags add <name>`), then guard the code with `flag('name')`, `<FeatureBoundary feature="name">`, or `useFeatureEffect`. Gate routes, nav, lazy chunks, timers, and fetches before the first slice merges.
2. Gated page routes go in the table in `src/routing/buildFeatureGatedRoutes.tsx`; navigation items carry `feature: 'name'`; workspaces carry `exposureKey`.
3. Server-backed: add `capability` and `label`, gate the route with `createServerCapabilityGate`, and set the deployment switch in `deploy/*-deployment-config.json` on the ref you deploy.
4. Baseline per-target tests are derived from the registry (`src/config/flags.baseline.test.tsx`, `server/lib/flags.test.js`). Write a test only for feature-specific behavior, using `withFlag('name', value, target?)` from `src/testing/flags.ts`.
5. Flipping a target on is its own reviewed change. Retire or promote the flag before its `removeBy` release.

Premium rule: if operating the feature costs money (for example cloud storage) it is a premium candidate; otherwise free. Core features are always free. A client flag never bypasses server-owned entitlement checks (`/userEntitlements/{uid}.premiumActive`, Firestore capability flags).

## Auto-TSTM (only current server-backed capability)

- Flag `autoTstm`, env `TSTM_GENERATION_ENABLED`, ingestion `TSTM_INGESTION_ENABLED`.
- Routes `GET /api/tstm/latest`, `/api/tstm/status`: no auth, 120/min/client, cache-only. Interactive requests never start generators.
- Error `reason`s: `cache_miss`, `cache_stale`, `cache_corrupt` (404), `unavailable` (503). Never leak paths/stderr/stacks.
- Emergency disable: set `EMERGENCY_DISABLED_CAPABILITIES=TSTM_GENERATION_ENABLED` in the host `.env` and restart pm2 (beta: `/opt/gfc-beta-analytics`, process `gfc-beta-analytics`). Disable-only. Stop ingestion with `TSTM_INGESTION_ENABLED=false`. Runbook: [emergency-feature-disable](../operations/emergency-feature-disable.md), ops: [auto-tstm-operations](../operations/auto-tstm-operations.md).
