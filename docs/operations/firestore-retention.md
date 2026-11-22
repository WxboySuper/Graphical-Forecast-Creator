# Firestore retention and TTL

Two server collections write an `expiresAt` timestamp, but no code in this
repository deletes expired documents. Firestore reclaims them only when a TTL
policy exists on that field. Application deployment does not create TTL
policies, so a missing policy means both collections grow without bound and the
retention window in the code never takes effect.

| Collection | Field | Written by | Retention |
| --- | --- | --- | --- |
| `processedStripeWebhookEvents` | `expiresAt` | `server/billing-webhook-state.js` (`buildEventLedgerEntry`) | 30 days after `processedAt` |
| `adminMetricDedupes` | `expiresAt` | `server/metrics.js` (`writeMetricDedupeDocs`, value from `getDedupeExpiryDate`) | 35 days after creation |

## Why the windows matter

`processedStripeWebhookEvents` deduplicates Stripe event ids. Its 30-day
retention is also the replay window: an identical event id delivered after the
ledger document expires is treated as new. Shorten the window only after
checking Stripe's retry and replay behavior.

`adminMetricDedupes` holds one document per device and account per day so the
active-device and active-account counters increment once. Its 35-day window is
only about storage. Deleting these documents early can let a counter increment
twice for the same day.

## Required setup

Configure both policies in every Firebase project used by the deployment
(production, staging, and beta). Use the Firebase console under Firestore
Database > TTL, or run:

```powershell
gcloud firestore fields ttls update expiresAt `
  --collection-group=processedStripeWebhookEvents `
  --enable-ttl `
  --project <firebase-project-id>

gcloud firestore fields ttls update expiresAt `
  --collection-group=adminMetricDedupes `
  --enable-ttl `
  --project <firebase-project-id>
```

Confirm both policies show as enabled. Firestore deletes expired documents
asynchronously; a document can remain readable for hours after `expiresAt`, so
dedupe logic must not depend on immediate deletion. It does not: both paths
treat an existing document as the dedupe signal.

## When retention constants change

The TTL policy reads the timestamp, not the constant. If
`EVENT_LEDGER_RETENTION_MS` in `server/billing-webhook-state.js` or
`DEDUPE_TTL_DAYS` in `server/metricsValues.js` changes, update the table above
and re-check that the corresponding policy still exists. The policy itself does
not need to change.

Both writers store a fixed `expiresAt` when they create a document, so a new
retention constant only affects future writes. Existing documents keep the
`expiresAt` value they were written with. If a shorter window must also apply
to documents already stored, update their `expiresAt` timestamps separately;
changing the constant or the TTL policy will not rewrite them.
