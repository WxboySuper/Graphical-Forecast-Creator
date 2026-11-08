# Feedback service operations

The feedback API runs as a standalone Cloudflare Worker at `feedback.gfcweather.com`. It stores submissions in D1. It does not call the VPS or Firestore.

## Create and configure D1

1. In the Cloudflare dashboard, open **Workers & Pages → D1 SQL Database** and create a database named `gfc-feedback` in the same account as the Worker.
2. Copy its database ID into `cloudflare/wrangler.feedback.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
3. Replace `REPLACE_WITH_FIREBASE_PROJECT_ID` with the Firebase project ID used by GFC.
4. Add GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The API token needs Workers Scripts edit, D1 edit, and access to this account.
5. Confirm `FEEDBACK_ALLOWED_ORIGINS` includes the beta and production frontend origins. Local origins are included by default for development.
6. Run the **Deploy feedback Worker** workflow once. It applies remote D1 migrations and deploys the Worker. Submissions return 503 until the required hash salt is set.
7. In **Workers & Pages → gfc-feedback → Settings → Variables and Secrets**, add secret `FEEDBACK_HASH_SALT` (a long random value, required) and secret `FEEDBACK_ADMIN_TOKEN` (a separate long random value). Add `FEEDBACK_DISCORD_WEBHOOK_URL` if Discord delivery is wanted. Set `FEEDBACK_DISCORD_TAG_BETA` and `FEEDBACK_DISCORD_TAG_PROD` as ordinary variables if the forum uses corresponding tag IDs.
8. Confirm `feedback.gfcweather.com` appears under the Worker custom domains and resolves in the Cloudflare zone. Wrangler provisions the configured custom domain during deploy.
9. Run the **Deploy feedback Worker** workflow again to publish the domain and current configuration.

The Discord webhook must point to a forum channel. Each submission creates a forum thread. The Worker disables mention parsing and limits the message and embed fields before sending.

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

List filters are `status`, `target`, `category`, `since` (Unix milliseconds), `limit` (1–100), and `cursor` (the previous response's `nextCursor`). Agents can use the same API over server-side HTTPS with the admin token. Admin endpoints intentionally omit CORS headers.

## Retention

Abuse limits: each user may submit 5 per 10 minutes and 20 per day, and the whole service accepts at most 120 submissions per 10 minutes (a flood from many throwaway accounts hits that cap and receives 429). Firebase sign-up is the only friction on account creation, so for stronger protection add a Cloudflare rate limiting rule on `POST feedback.gfcweather.com/v1/feedback` (for example 20 requests per minute per IP). Admin brute-force attempts are throttled per `CF-Connecting-IP`; requests that reach the Worker through Cloudflare always carry it, and any request without it is throttled per presented token. The admin API refuses any request carrying an `Origin` header (browsers), so it can only be driven from curl or server-side agents.

Submissions have no automatic expiry. Review the D1 data periodically and delete records when they are no longer useful. Keep enough history to support follow-up and product review, then use a D1 SQL query to remove older rows. Email is saved only when the submitter opts into contact and Firebase reports the address as verified. User IDs are stored only as salted SHA-256 hashes, and the admin API never returns that hash. It returns `email` only for submitters who opted in, so treat the admin token as sensitive. Back up or export records before a bulk deletion if the owner needs an archive.

Example to remove feedback older than one year, after checking the affected count:

```sql
SELECT COUNT(*) FROM feedback WHERE created_at < (unixepoch('now') - 365 * 86400) * 1000;
DELETE FROM feedback WHERE created_at < (unixepoch('now') - 365 * 86400) * 1000;
```

## Local tests

Run `pnpm test:cloudflare` to execute the standalone Worker tests with Node's built-in test runner. Tests generate an RSA keypair and use a small in-memory D1 fake.

Invalid list filters return HTTP 400. Admin token failures are tracked by a salted hash of the client IP. After 10 failed attempts in 10 minutes, further failures from that IP return HTTP 429 with Retry-After; a valid token clears that IP's failure count.
