# Firestore rules deployment and verification

`firestore.rules` is the repository source of truth for hosted Firestore authorization. Application deployment does **not** deploy these rules automatically; a rules change is incomplete until the intended Firebase project is explicitly selected, deployed, and verified.

## Before deployment

1. Confirm the target Firebase project with the release owner. Do not infer it from a branch name.
2. Authenticate the Firebase CLI and verify the selected project:

   ```powershell
   firebase login
   firebase projects:list
   ```

3. Run the hostile-client suite:

   ```powershell
   pnpm test:firestore-rules
   ```

4. Review the rule diff and confirm the expected data contract:

   - users may read and update only their ordinary profile metadata;
   - access, role, and administrative profile fields remain server-owned;
   - cloud-cycle create/update requires an active server-owned entitlement;
   - cloud-cycle owners retain read/delete access after downgrade;
   - document fields and payloads stay within the checked-in bounds.

## Deploy

Use the explicit project identifier supplied by the release owner:

```powershell
firebase deploy --only firestore:rules --project <firebase-project-id>
```

Never deploy from an unreviewed working tree. Record the deployed commit SHA and Firebase project in the private release log.

## Hosted verification

Repeat the same authorization matrix against the hosted project with dedicated test accounts:

- signed out and wrong-owner requests are denied;
- an ordinary owner cannot create or mutate reserved profile fields;
- the Admin SDK beta-claim path can grant access;
- free/inactive accounts cannot create or update cloud cycles;
- an active account can create/update its own bounded document;
- downgraded accounts can read and delete, but cannot update, existing data;
- malformed and oversized documents are denied.

If any denial test succeeds unexpectedly, restore the last known-good rules immediately and stop promotion.
