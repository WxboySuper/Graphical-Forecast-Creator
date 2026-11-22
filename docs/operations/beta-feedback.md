# Feedback service operations

The feedback API runs as a standalone Cloudflare Worker at `feedback.gfcweather.com`. It stores submissions in D1. It does not call the VPS or Firestore.

## Create and configure D1

1. Confirm the configured `gfc-feedback` D1 database and `FIREBASE_PROJECT_ID` in `cloudflare/wrangler.feedback.jsonc` match the owner's Cloudflare and Firebase accounts.
4. Add GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The API token needs Workers Scripts edit, D1 edit, and access to this account.
5. Confirm `FEEDBACK_ALLOWED_ORIGINS` includes the beta origin plus `https://app.gfcweather.com` and `https://gfcweather.com` during the hostname transition. Local origins are included by default for development.
6. In **Workers & Pages → gfc-feedback → Settings → Variables and Secrets**, add secret `FEEDBACK_HASH_SALT` (a long random value, required) and secret `FEEDBACK_ADMIN_TOKEN` (a separate long random value). Add `FEEDBACK_DISCORD_WEBHOOK_URL` if Discord delivery is wanted. Set `FEEDBACK_DISCORD_TAG_BETA` and `FEEDBACK_DISCORD_TAG_PROD` as ordinary variables if the forum uses corresponding tag IDs.
7. Confirm `feedback.gfcweather.com` appears under the Worker custom domains and resolves in the Cloudflare zone. Wrangler provisions the configured custom domain during deploy.
8. Run the **Deploy feedback Worker** workflow. It applies all pending D1 migrations before publishing the Worker.

The Discord webhook must point to a forum channel. Each submission creates a forum thread. The Worker disables mention parsing and limits the message and embed fields before sending.

Discord secrets on `gfc-feedback`:

- `FEEDBACK_DISCORD_WEBHOOK_URL` (optional): the forum webhook for new submissions. The Worker stores each new thread's ID (migration `0004`), and status changes made in the viewer or through `PATCH /v1/feedback/:id` are posted into that thread, for example `Feedback <id> marked **Handled**`.
- `FEEDBACK_DISCORD_UPDATES_WEBHOOK_URL` (optional): a webhook for an ordinary text channel. When set, every status change goes there instead of into the forum thread. Without it, status changes for items that have no stored thread are not posted. That covers submissions from before the thread ID was recorded or whose Discord delivery failed.

Status notifications run in the background. A Discord failure never fails or delays the status change.

## Read and update feedback

Use `FEEDBACK_ADMIN_TOKEN` from a secure shell environment. The API returns JSON. Never paste the token into a shared terminal transcript.

```sh
curl -H "Authorization: Bearer $FEEDBACK_ADMIN_TOKEN" \
  'https://feedback.gfcweather.com/v1/feedback?status=new&target=beta&limit=50'

curl -H "Authorization: Bearer $FEEDBACK_ADMIN_TOKEN" \
  'https://feedback.gfcweather.com/v1/feedback/FEEDBACK_ID'

curl -X PATCH -H "Authorization: Bearer $FEEDBACK_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"triaged"}' \
  'https://feedback.gfcweather.com/v1/feedback/FEEDBACK_ID'
```

List filters are `status` (`new`, `read`, `handled`), `target`, `category`, `since` (Unix milliseconds), `limit` (1–100), and `cursor` (the previous response's `nextCursor`). Agents can use the same API over server-side HTTPS with the admin token. The Access protected `/admin/api/*` endpoints power the dashboard at the exact origin in `FEEDBACK_ADMIN_ORIGIN`; they verify the Access JWT and use credentialed CORS only for that origin.

## Feedback viewer (Cloudflare Access)

The Worker also provides a browser viewer at `https://feedback.gfcweather.com/admin`. It verifies each Cloudflare Access JWT itself and rejects requests without a valid issuer, audience, signature, and identity. Set `CF_ACCESS_ALLOWED_EMAILS` to enforce an additional email allowlist in the Worker.

1. In Cloudflare Zero Trust, create a self-hosted Access application for `feedback.gfcweather.com` with the application path set to `/admin*` only. Do not include `/v1/*`.
2. Add an allow policy for the owner's email address.
3. Copy the Access application's AUD tag and the Zero Trust team domain into `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` in `cloudflare/wrangler.feedback.jsonc`, then deploy the feedback Worker.
4. Visit `https://feedback.gfcweather.com/admin` and sign in through Access. Optionally set `CF_ACCESS_ALLOWED_EMAILS` to a comma-separated email allowlist for an additional Worker-side check.

The Access protected inbox lists feedback newest first with pagination, supports a status filter, opens individual items, and changes status to `new`, `read`, or `handled`. Marking an item handled sets `handled_at`; moving it back clears that timestamp. Existing `triaged`, `resolved`, or `wontfix` rows become `read` when migration `0003_feedback_inbox_status.sql` runs. Email appears only when a submitter opted in to contact.

## Retention

Abuse limits: each user may submit 5 per 10 minutes and 20 per day, and the whole service accepts at most 120 submissions per 10 minutes (a flood from many throwaway accounts hits that cap and receives 429). Firebase sign-up is the only friction on account creation, so for stronger protection add a Cloudflare rate limiting rule on `POST feedback.gfcweather.com/v1/feedback` (for example 20 requests per minute per IP). Admin token brute-force attempts are throttled per salted hash of `CF-Connecting-IP`; raw IPs are not stored.

Submissions have no automatic expiry. Review the D1 data periodically and delete records when they are no longer useful. Keep enough history to support follow-up and product review, then use a D1 SQL query to remove older rows. Email is saved only when the submitter opts into contact and Firebase reports the address as verified. User IDs are stored only as salted SHA-256 hashes, and the admin API never returns that hash. It returns `email` only for submitters who opted in, so treat the admin token as sensitive. Back up or export records before a bulk deletion if the owner needs an archive.

Example to remove feedback older than one year, after checking the affected count:

```sql
SELECT COUNT(*) FROM feedback WHERE created_at < (unixepoch('now') - 365 * 86400) * 1000;
DELETE FROM feedback WHERE created_at < (unixepoch('now') - 365 * 86400) * 1000;
```

## Local tests

Run `pnpm test:cloudflare` to execute the standalone Worker tests with Node's built-in test runner. Tests generate an RSA keypair and use a small in-memory D1 fake.

Invalid list filters return HTTP 400. Admin token failures are tracked by a salted hash of the client IP. After 10 failed attempts in 10 minutes, further failures from that IP return HTTP 429 with Retry-After; a valid token clears that IP's failure count.
