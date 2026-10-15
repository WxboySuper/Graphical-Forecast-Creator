# Beta authentication migration: Firebase to Clerk

**Status:** Investigation complete. No provider or rollout change is approved by this document.

**Merge hold:** Do not merge this PR before November 1, 2026. Any implementation or beta rollout needs a separate go/no-go review after that date.

## Recommendation

Treat this as an identity-provider change for the beta deployment, not a Firebase removal. Keep Firestore and its current document model during the first rollout. Preserve each existing Firebase UID as GFC's canonical account ID so profile, settings, entitlement, metrics, workflow, custom-product, cloud-cycle, and Stripe records continue to point at the same account.

For the first beta cut, evaluate Clerk as the sign-in and session provider with a server-controlled Firebase custom-token bridge. The server would verify the Clerk session, resolve the Clerk account to its existing Firebase UID, and mint a Firebase custom token for that UID. The browser would exchange that token for a Firebase session to keep using the existing Firestore SDK and security rules. Server routes must derive the canonical UID from verified credentials, never from a request body or client metadata.

Keep this bridge as a migration boundary. Moving Firestore access behind the API is a separate, larger project. Clerk's published Firebase integration guide describes a similar token exchange, but the guide is marked deprecated, so GFC should not depend on that managed integration without confirming its support status with Clerk.

## Current coupling

- `src/auth/AuthProvider.tsx` uses Firebase Auth for Google and email/password sign-in, account reauthentication and deletion, and listens for Firebase auth state changes.
- `src/auth/AuthProvider.tsx` and `src/lib/cloudCyclesService.ts` access Firestore from the browser. `firestore.rules` authorizes these requests with `request.auth.uid` and uses that UID for ownership and entitlement checks.
- `server/firebase-auth.js` verifies Firebase ID tokens. Beta invite claims, cloud-cycle API routes, billing routes, and account deletion use the verified Firebase UID.
- Server billing and Stripe webhook state store Firebase UIDs in entitlement documents and Stripe metadata. Account deletion removes the Firebase identity and cleans up associated records.
- The beta release workflow builds the frontend with `VITE_FIREBASE_*` and deploys the API with `FIREBASE_ADMIN_*`. Beta is a release channel on `main`, so the migration must use beta-specific Clerk and Firebase configuration and must not change production defaults.

These dependencies mean that swapping the sign-in widget or changing only the frontend SDK would leave authorization inconsistent and could orphan paid or user-owned data.

## Options considered

| Option | Assessment |
| --- | --- |
| Clerk with the documented Firebase integration | Smallest client change and preserves Firestore access. Clerk currently marks its integration guide deprecated. Do not select it without a support commitment or a replacement path. |
| Clerk sessions with a GFC-managed Firebase custom-token bridge | Best candidate for a beta trial. Preserves existing Firebase UIDs, Firestore rules, and data paths while moving interactive sign-in to Clerk. Adds a security-sensitive token-exchange endpoint and keeps Firebase Auth as an authorization bridge. |
| Clerk sessions with all Firestore access moved behind the GFC API | Cleaner long-term provider boundary. Requires replacing direct client reads/writes, authorization checks, and realtime subscriptions. This is too broad for the initial beta migration. |

## Identity and account migration

1. Confirm that beta's Firebase project and account export are separate from production. Record the project IDs and deployment secret names without copying secret values into the repository.
2. Inventory beta accounts and sign-in methods. Include Firebase UIDs, verified email addresses, provider IDs, account state, and linked Stripe customer/subscription identifiers. Do not export password hashes into a tracked file.
3. Test Clerk's documented Firebase password-hash import with a small set of beta-only accounts. Clerk supports Firebase scrypt imports when the Firebase hash parameters are supplied. Keep those parameters in a restricted migration environment.
4. Preserve the old Firebase UID as a server-managed external identity mapping. Do not trust a user-editable Clerk metadata field to choose the Firebase UID.
5. Test Google account linking with verified email addresses. Imported OAuth users may need to sign in with Google and link their existing account; email equality alone must not silently merge identities.
6. Keep a tested rollback path that restores Firebase sign-in for beta without changing Firestore documents, Stripe metadata, or production configuration.

Clerk documents importing Firebase users, including Firebase scrypt password digests and prior IDs as external IDs. The import guide does not resolve GFC's Google account-linking policy or its Stripe and Firestore identity mapping; those remain GFC decisions.

## Work required before an implementation PR

- Verify beta and production use separate Firebase projects, Clerk instances, API credentials, domains, and deployment secrets.
- Decide whether the beta migration is invite-only, uses user-triggered account linking, or requires a maintenance window. Do not silently merge accounts by email.
- Define the Clerk-to-canonical-UID mapping store, its write permissions, uniqueness constraint, recovery process, and audit trail.
- Specify the custom-token exchange, token lifetimes, rate limits, CSRF/origin checks, session revocation behavior, and failure handling.
- Update server verification so Clerk-only endpoints and Firebase-backed Firestore access have explicit credential boundaries.
- Adapt account deletion and recent-auth checks. Verify deletion still handles Stripe cleanup, Firestore-owned records, Firebase bridge identity, and the Clerk identity without leaving a re-creatable mapping.
- Confirm Clerk plan limits, beta domain setup, email delivery, privacy disclosures, and processor terms before importing real beta users.
- Add migration and rollback runbooks. Exercise both against a beta-only staging dataset before any production-facing change.

## Go/no-go checks for November review

- [ ] The beta Firebase project is confirmed separate from production.
- [ ] Every migrated test account resolves to exactly one existing canonical UID.
- [ ] Password sign-in and Google sign-in/linking work for representative beta accounts.
- [ ] Firestore owner rules still prevent cross-account reads and writes.
- [ ] Beta claims, settings sync, cloud cycles, entitlement reads, billing, and account deletion pass end-to-end checks.
- [ ] Rollback restores Firebase sign-in and access to the same records.
- [ ] No change reaches production configuration or deployment secrets.
- [ ] Maintainer approves the rollout window after November 1, 2026.

## References

- [Clerk: Migrate from Firebase](https://clerk.com/docs/guides/development/migrating/firebase)
- [Clerk: Integrate Firebase with Clerk (deprecated)](https://clerk.com/docs/guides/development/integrations/databases/firebase)
- [Clerk: JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates)
- [Clerk: Migration strategies](https://clerk.com/docs/guides/development/migrating/overview)
