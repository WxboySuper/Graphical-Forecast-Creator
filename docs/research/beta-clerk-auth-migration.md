# Beta Clerk and D1 migration

**Status:** Implementation is prepared behind an explicit beta release input. The default beta release remains Firebase + the VPS API.

**Merge and rollout hold:** Keep this pull request in draft and do not merge before November 1, 2026 or before v1.8 has released. Do not select `clerk-d1` for a beta release until the setup and go-live checklist below is complete. Production remains on Firebase + the VPS.

## What changed

- Added a beta-only Clerk provider. `VITE_BETA_AUTH_BACKEND=clerk-d1` enables Clerk's React components, Google One Tap, email/password sign-in, and the Worker API session token. Other build targets continue using Firebase.
- Added a Cloudflare Worker API path backed by D1. The existing Worker proxy remains the default Firebase beta path until a release explicitly selects `clerk-d1`.
- Added D1 tables for Clerk users, settings, entitlements, metrics, cloud cycles, workflow awareness, custom products, Stripe event idempotency, and user forecast/discussion/verification records.
- Added the beta Firestore snapshot exporter. It requires the configured Firebase project to exactly match `BETA_FIREBASE_PROJECT_ID`, normalizes and hashes email addresses, and writes per-user JSON files with private file permissions. The files are intended for the beta R2 snapshot bucket; no user snapshot is committed to this repository.
- Added first-request migration. The Worker accepts only a Clerk session with a verified primary email, fetches that email from Clerk's Backend API, matches it to the snapshot, and moves owned records into D1 under the Clerk user ID. D1's `users` row records the legacy Firebase UID for continuity with migrated billing metadata; there is no identity mapping table. Migration writes are idempotent, failed attempts can retry, and the R2 snapshot has no automatic expiry.
- Added beta release selection for Firebase or Clerk+D1. The VPS API deploy job only runs for Firebase releases. The Clerk+D1 path applies D1 migrations and deploys the Worker using a generated config containing the database ID.

## Firestore inventory and record scope

Current persistent user records are `userProfiles`, `userSettings`, `userEntitlements`, `userMetrics`, `cloudCycles` and each cycle's `payload/payload`, `users/{uid}/workflowAwareness`, and `users/{uid}/customProducts`. The exporter matches the profile email to the signed-in Clerk email, then includes those account-owned documents. It also converts legacy `userSettings.cloudCycles` records and avoids duplicate cycle IDs when a current `cloudCycles` document exists.

The existing application does not have Firestore collections or VPS CRUD endpoints for forecasts, discussions, or verification sessions. Those workflows persist in browser/local application state. The migration adds authenticated D1 CRUD routes for those record types, but there are no existing Firestore records of those types to import. Moving the current local browser data into account-synced D1 records would be a separate product change and is not silently included here.

System-wide Firestore collections such as `adminDailyMetrics`, `adminMetricDedupes`, and Firebase deletion/webhook internals are not user-owned migration data. D1 admin summaries are recalculated from migrated user data; historical daily aggregate rows are not carried over.

## Required Clerk and Cloudflare setup

The external accounts are not provisioned by repository code. Before choosing Clerk+D1 for a release:

1. Create a Clerk application with separate development and production instances. Configure Google with custom credentials and enable Google One Tap. Enable email/password for the beta instance. Add `beta.gfcweather.com` to the beta Clerk instance; record `gfcweather.com` only for future production work. Do not put production credentials in this beta deployment.
2. Configure the beta Clerk instance's authorized party for `https://beta.gfcweather.com`. In Cloudflare Worker secrets, set `CLERK_SECRET_KEY` and the PEM public key as `CLERK_JWT_KEY`. Add the Clerk development publishable key as the GitHub Actions secret `BETA_CLERK_PUBLISHABLE_KEY`. `CLERK_AUTHORIZED_PARTIES` defaults to the beta domain; set it only if Clerk issues beta sessions for another known origin.
3. Create the beta-only D1 database named `gfc-beta` and the R2 bucket `gfc-beta-firestore-migration-snapshot`. Set the D1 UUID as GitHub Actions secret `BETA_D1_DATABASE_ID`.
4. Set Cloudflare Worker secrets `BETA_INVITE_TOKEN`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` as applicable. Set beta-only Stripe price IDs, `ADMIN_CLERK_ID_ALLOWLIST` or the legacy UID allowlist, the invite path, and `SENTRY_BROWSER_DSN` in Worker vars/secrets. Configure a Clerk webhook subscribed to `user.deleted` at `https://beta.gfcweather.com/api/webhooks/clerk`; its signed event removes the user's D1 records and queues Stripe customer deletion. A daily Worker cron retries queued Stripe deletions and removes product metric events older than 90 days. The Clerk client requires reverification before account deletion. Point only the beta Stripe webhook at `/api/billing/webhook`.
5. Ensure the Clerk dashboard email/password flow requires a verified primary email. The Worker checks the Clerk Backend API's primary address verification state on authenticated requests.

Firebase password hashes are not imported into Clerk by this implementation. Users who choose email/password will set a Clerk password during sign-up/reset; Google sign-in continues through Clerk's Google connection. Existing user-owned data is linked by verified email on first Clerk API request.

## Snapshot export and upload

Install the `server` package dependencies, then export using a beta-only Firebase Admin service account:

```powershell
$env:FIREBASE_ADMIN_PROJECT_ID = '<beta Firebase project id>'
$env:BETA_FIREBASE_PROJECT_ID = '<same beta Firebase project id>'
$env:FIREBASE_ADMIN_CLIENT_EMAIL = '<beta service account email>'
$env:FIREBASE_ADMIN_PRIVATE_KEY = '<beta service account private key>'
 node server/export-firestore-beta-snapshot.mjs --output C:\private\gfc-beta-firestore-snapshot
```

The output directory contains `full-snapshot.jsonl` plus hashed per-user JSON files. Upload the full snapshot to a private archival key in the R2 bucket and upload each hashed per-user file to `by-email/<sha256-of-normalized-email>.json` using Wrangler's remote R2 object upload. Confirm both document and per-user counts before enabling Clerk. Keep the R2 objects until the maintainer explicitly decides the migration source can be deleted. Securely remove local export files after upload and validation.

## Beta deployment

The beta release workflow still defaults to `auth_backend=firebase`. After v1.8, the migration PR is merged, all required Cloudflare/Clerk secrets exist, and the snapshot is uploaded, select `auth_backend=clerk-d1` when dispatching the beta release workflow. That path applies `cloudflare/migrations` to the beta D1 database and deploys the Clerk+D1 Worker configuration. It skips the beta VPS API deployment. Production release and deploy workflows are not changed.

The workflow smoke check verifies `/api/health` reports `gfc-beta-worker` with D1 available. After deployment, verify representative sign-in, invite claim, settings, entitlement, cloud-cycle create/list/load/rename/delete, workflow awareness, custom products, billing, and account deletion in beta. Verify forecast, discussion, and verification remain functional in their existing local persistence flows; the new D1 records API can be exercised independently but is not their current storage path.

## Operational notes and limits

- This repository does not include real Clerk credentials, D1 IDs, R2 contents, or Firebase exports. Those must be provisioned in the beta accounts after v1.8.
- `cloudflare/wrangler.beta.clerk-d1.jsonc` is a template. The release workflow generates a temporary config from `BETA_D1_DATABASE_ID`; the database and R2 bucket must already exist.
- Beta D1 currently disables Auto-TSTM and returns an unavailable response for `/api/tstm/latest`; its server implementation launches a Python/GRIB workflow and is not part of the user-data/auth migration. Do not select Clerk+D1 if beta requires Auto-TSTM until that workload has a Worker-compatible service design.
- D1 admin summaries contain current totals only; the prior Firestore daily admin history is not migrated.
- Keep the Clerk+D1 release choice off until the v1.8 and November hold clears. Switching the workflow input back to Firebase after D1 users have written new data does not copy those new writes back to Firestore.
