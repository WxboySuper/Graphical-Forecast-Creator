# Release and deploy operations

Do not run release/deploy workflows unless the owner asks. Procedures here are condensed; authoritative detail is in the linked docs.

## Model

- `main` = fast trunk and beta source. `stable/2.x` = v2 production. Beta = prerelease cut from `main` (not a branch). Merging deploys nothing.
- Targets: `local`, `beta` (`beta.gfcweather.com`, Cloudflare Worker `gfc-beta` + VPS API at `/opt/gfc-beta-analytics`), `staging` (`staging-gfc.weatherboysuper.com`), `production` (`app.gfcweather.com`, Cloudflare Worker `gfc-production` + VPS API at `/opt/gfc-analytics`). The apex and `www` hostnames serve the separate `gfc-marketing` Worker.
- Old docs/comments may say `beta-gfc.weatherboysuper.com`; the Cloudflare config uses `beta.gfcweather.com`.

## Versioning

GFC release labels use a flat major version. After the v2 cut, `main` carries v3 as `3.0.0-beta.N`; production remains on `stable/2.x`. A minor such as `v2.1` maps to package and tag version `2.1.0` / `v2.1.0`. The patch slot stays `0`. Use short labels (`v2`, `v2.1`) in UI, docs, release titles, changelog prose, and PR text. Use padded semver in `package.json` and git tags.

Beta tags keep their semver prerelease form. The counter belongs to its base version and restarts at `beta.1` for each new major. The first v3 beta is `3.0.0-beta.1`, tagged `v3.0.0-beta.1`. Hotfixes for v2 use the stable line and tags such as `v2.1.0`. Existing stable branches and tags remain historical records. The Terms of Service and Privacy Policy use independent flat integer versions, such as `Version 2`, rather than app semver.

## Workflows

### Feedback Worker

The standalone `gfc-feedback` Worker is deployed manually with `.github/workflows/deploy-feedback-worker.yml` (Actions → Deploy feedback Worker → Run workflow). The workflow installs dependencies, applies pending D1 migrations to the remote `gfc-feedback` database, then deploys `cloudflare/wrangler.feedback.jsonc`. It does not create the D1 database, configure Cloudflare Access, or set Worker secrets.

Before the first run, the owner must verify the `gfc-feedback` D1 `database_id` and `FIREBASE_PROJECT_ID` in `cloudflare/wrangler.feedback.jsonc`, set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` to the values from the Cloudflare Access application, and add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The Cloudflare API token needs Workers Scripts edit and D1 edit for that account. Set Worker secrets `FEEDBACK_HASH_SALT` and `FEEDBACK_ADMIN_TOKEN` in the Cloudflare dashboard. `FEEDBACK_ADMIN_ORIGIN` is the dashboard CORS allowlist and defaults to `https://admin.gfcweather.com`; change it only if the dashboard origin changes. Never put secret values in this repository.

Run the deploy workflow after the bindings and GitHub secrets are set. It runs `pnpm dlx wrangler@4 d1 migrations apply gfc-feedback --remote --config cloudflare/wrangler.feedback.jsonc` before `pnpm dlx wrangler@4 deploy --config cloudflare/wrangler.feedback.jsonc`. For a local preview of unapplied migration SQL, use `pnpm dlx wrangler@4 d1 migrations list gfc-feedback --remote --config cloudflare/wrangler.feedback.jsonc`; do not manually apply migrations out of order. Configure a Cloudflare Access self-hosted application for `feedback.gfcweather.com/admin*` and allow only the owner. The `/admin/api/*` inbox checks the Access JWT itself. The admin dashboard origin must be permitted by `FEEDBACK_ADMIN_ORIGIN`.

| Workflow | Purpose | Key inputs |
|----------|---------|-----------|
| `release-beta.yml` | Full beta cut from `main`; scheduled every six hours and manually started with a click. It skips when main has no new commits since the latest beta. | `dry_run`, `deploy_api`, `only_if_changed`, optional version (`X.Y.Z-beta.N`), `previous_tag` |
| `deploy-beta-workers.yml` | Redeploy existing ref to Worker | `ref=vX.Y.Z-beta.N` |
| `prepare-stable-promotion.yml` | Promotion PR into `main` | `source_ref=main`, `version=auto` |
| `bootstrap-stable-release.yml` | Create `stable/X.x` at the approved main commit | |
| `release-stable.yml` | Stable/hotfix release; publishing triggers production deploy | `line=auto` or `N.x`, `dry_run`, optional `previous_tag`, `baseline_ref` (the final changelog audit start; default is the last clean audit); `production-promote` environment approval |
| `deploy-staging.yml` | Manual stable branch/tag/commit rehearsal. `auto` selects the highest stable branch. | `ref=auto` |
| `deploy-main-to-vps.yml` | Production Worker frontend and VPS API deploy; optional VPS frontend for rollback | `ref=auto` selects the highest stable branch |
| `backport.yml` | `backport-2.x` label -> PR against `stable/2.x`; conflicts create a draft PR | PR number and optional line for manual runs |
| `opencode-changelog-audit.yml` | Changelog vs code audit (weekly + release preflight; stateless, baseline = last release tag or `baseline_ref`) | `baseline_ref` bounds range |

Beta release notes list only the pull requests merged since the previous beta tag (`RELEASE_NOTES_MODE: prs`, previous beta found automatically or from `previous_tag`) and link to the full changelog. The stable release owns the corresponding major changelog.

Manual beta runs are a click in Actions, or `gh workflow run release-beta.yml --ref main -f dry_run=false -f deploy_api=true`. Concurrency group `beta-release`. Beta cuts only bump `package.json`; `CHANGELOG.md` is not rewritten.

### Beta sequence

lint+test -> resolve version, validate next-major lane has real content -> pre-build -> commit only `package.json`, push `main`, tag `vX.Y.Z-beta.N`, **draft** prerelease -> build with Sentry maps, deploy Worker, deploy VPS API (rsync `server/` excluding `.env`, `.env` mode 600, pm2 restart) -> smoke `/`, `/version.json`, `/api/capabilities/status` -> publish.

### Beta failure recovery

| Situation | Action |
|-----------|--------|
| Worker deploy failed, tag exists | `deploy-beta-workers.yml ref=vX.Y.Z-beta.N` or `wrangler rollback` |
| VPS API deploy failed | Redo API steps manually. **Do not rerun the Release Beta workflow** (cuts a new version). Worker-only redeploy does not update the API. |
| Smoke failed | Fix, redeploy by tag, then publish the draft |
| Draft left open | Redeploy by tag, confirm smoke, publish draft in GitHub or delete it |
| Tag exists, release abandoned | Delete tag + draft before reusing the version |

### Stable and hotfix

Production gate: every workflow that changes production waits for an approval click on the `production-promote` environment (reviewer: the maintainer): promotion, bootstrap, `release-stable.yml`, `deploy-main-to-vps.yml` (manual and release-triggered runs), and the feedback and telemetry Worker deploys. Agents run `gh` as the maintainer, so an ungated workflow could deploy production without the maintainer seeing it. Staging and beta stay ungated. The separate `production` environment (15-minute wait timer, no reviewer) is not used.

Stable promotion: click Prepare Main Stable Promotion, review and merge its PR, then click Bootstrap Stable Release Line. Bootstrap creates `stable/N.x` at the approved commit and opens a reviewed PR that starts `main` at `(N+1).0.0-beta.1`. Then run Actions -> Release | Stable -> Run workflow with `auto` (or a line such as `2.x`) and approve the `production-promote` prompt. The version is inferred: a beta package version becomes its stable version, an untagged stable version releases as is, and an already-tagged one advances to the next minor; the stable changelog lane moves into the new version section and resets. Use `dry_run` to see the decision first. Because the deploy is gated too, a stable release asks for approval twice: once to cut it and once to deploy it. Hotfix: branch from stable -> PR into stable with a hotfix changelog entry -> rehearse through Deploy Staging -> merge -> Create Stable Release. Backports use the label-driven backport workflow. A production-only fix stays on stable and is not carried to `main`. For a fix that applies to both, merge to `main` first and use `backport-2.x` to open its stable PR. See [workflow rules](workflow.md#backports).

GitHub Release notes: beta = native PR list + changelog link; stable = curated changelog + PR list; hotfix = curated hotfix entry + short PR list.

## Production Worker and rollback

### Telemetry Worker

`gfc-telemetry` runs at `https://telemetry.gfcweather.com`. Deploy it manually with the **Deploy telemetry Worker** GitHub Actions workflow after the owner creates the Worker, D1 database, Analytics Engine dataset, and Cloudflare Access application. The Worker has `workers_dev` disabled, a custom-domain route, observability enabled, a daily UTC cron that removes dedupe hashes from earlier days, and a 13:00 UTC cron for the optional Discord usage digest. Its Cloudflare rate-limiting binding allows 60 requests per IP per minute per Cloudflare location. Cloudflare documents this limiter as approximate and eventually consistent. It does not write its keys to the telemetry datasets.

D1 stores daily visit and active counts plus their temporary daily dedupe hashes. D1 is used for these counters because exact daily uniqueness needs an atomic dedupe key and count update. The key contains only a daily salted hash, is namespaced by counter type, and the cron deletes every key before the current UTC day. Hash salts are derived daily from `TELEMETRY_HASH_SECRET`; previous daily salts are not persisted. D1 counts contain no identity data and are retained for the admin overview. Feature events go to the `gfc_telemetry_events` Workers Analytics Engine dataset. Its raw retention window is 90 days, per Cloudflare's [Analytics Engine limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/).

For first-time setup, create the D1 database with `pnpm dlx wrangler@4 d1 create gfc-telemetry`, put the returned ID in `cloudflare/wrangler.telemetry.jsonc`, configure the Worker vars and secrets below, and create a Cloudflare Access application for the `/admin/*` paths at `telemetry.gfcweather.com`. The Analytics Engine dataset is created on the first event write. Apply the schema with:

```sh
pnpm dlx wrangler@4 d1 migrations apply gfc-telemetry --remote --config cloudflare/wrangler.telemetry.jsonc
```

The usage dashboard is served by the same Worker at `https://telemetry.gfcweather.com/admin/` (`/admin` redirects there). It sits behind the same Cloudflare Access application as the `/admin/*` JSON routes and shows daily visitors and active accounts, feature usage by event, page, location, and app version, and a link to the feedback inbox at `https://feedback.gfcweather.com/admin`. The usage panels that read Analytics Engine show a "not configured" note until `CF_ACCOUNT_ID` and `CF_ANALYTICS_API_TOKEN` are set; the visitor and account panels need only D1. "Total accounts" stays blank until a Firebase account count is wired in.

The manual deploy workflow applies this migration before deploying. The rate-limit namespace ID `61717` must remain unique within the Cloudflare account. Set the secret values interactively with `pnpm dlx wrangler@4 secret put <NAME> --config cloudflare/wrangler.telemetry.jsonc`, once per name. Never put secret values in the repository or logs:

- `TELEMETRY_HASH_SECRET`, used to derive the daily visit and active salts.
- `CF_ANALYTICS_API_TOKEN`, restricted to Account Analytics Read for the account.
- `CF_ACCOUNT_ID`, used by the Admin API to query Analytics Engine.
- `TELEMETRY_DISCORD_WEBHOOK_URL` (optional), a Discord webhook for a forum or text channel. Each digest is sent with `thread_name: Daily usage YYYY-MM-DD`, so a forum gets one thread per day. If a text channel rejects that with a 4xx, the Worker retries once without it. When set, the `0 13 * * *` cron (7 AM Central standard time, 8 AM daylight time) posts the daily usage digest. Without it the cron does nothing.

The daily digest covers the previous UTC day. It shows visitors and active users from D1 against the prior 7-day average, the last 7 days' totals (summed daily counts, so one person can count on several days), and the top features and pages from Analytics Engine. The feature and page section is skipped when `CF_ANALYTICS_API_TOKEN` is unset or the query fails. When a day's visitors or active users beat every earlier day in D1 (one `MAX` aggregate, while the trend rows read only the last 14 days), the digest opens with a new record line. Mondays add a week-over-week comparison and the biggest feature movers. When the `DISCORD_PING_USER_ID` var in `cloudflare/wrangler.telemetry.jsonc` is set, each digest, including any record line, mentions only that user, and `allowed_mentions` never allows `@everyone` or roles. The `0 0 * * *` cron still purges old dedupe hashes, and any other cron is logged and skipped. Webhook URLs are never logged; a failed post logs only Discord's HTTP status.

The feedback Worker's Discord secrets are listed in [beta feedback operations](../operations/beta-feedback.md).

Set the `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` vars to the Cloudflare Access team domain and admin application audience. Keep `TELEMETRY_ALLOWED_ORIGINS` aligned with the app origins. `FIREBASE_PROJECT_ID` validates active-user ID tokens. The Wrangler file's `account_id` is the same deployment account used by the other Workers. The admin overview reports total accounts as `null` because this Worker has no account-count source. Rough MAU is the sum of daily unique visitor counts across the latest `min(days, 30)` UTC days in the requested overview range. One visitor can appear on several days, so it overcounts distinct visitors across that window; the response includes `roughMauWindowDays` and an overlap caveat.

The public visit endpoint never accepts cookies. It combines the request IP and user agent with the day's salt, then stores only a daily count and a temporary dedupe hash. Active-user hashes use a separate namespace. Neither hash is written to feature-event rows or country aggregates. Feature event rows contain only event, detail, app version, Cloudflare country (or `XX`), and the numeric count.

`release-stable.yml` publishes a stable release. `deploy-main-to-vps.yml` then builds the app, deploys the VPS API, deploys `gfc-production` to `app.gfcweather.com`, builds and deploys `gfc-marketing` to the apex and `www`, then smoke-tests both Workers. It skips marketing steps for older refs without marketing files. `action=stage` still prepares the VPS staging preview and timed VPS rollout. The VPS cron cannot activate a Worker, so Workers change only when the production workflow runs with `action=live`.

The app Worker serves `/assets/*` with immutable caching, serves SPA routes from its asset binding, and proxies `/api/*` and `/api/sentry-tunnel` through `https://gfc.weatherboysuper.com` to the existing VPS API. The marketing Worker serves static pages, redirects legacy app paths to `app.gfcweather.com`, and forwards `/api/*` through its service binding to `gfc-production`. It sends other `www` requests to the apex. Both workers apply security headers. Install [`server/nginx-legacy-redirect.conf`](../../server/nginx-legacy-redirect.conf) after cutover so the VPS sends page requests to the app hostname and leaves API paths on the VPS.

To roll back the app, run `wrangler rollback --config cloudflare/wrangler.production.jsonc`; roll back the marketing Worker with `wrangler rollback --config cloudflare/wrangler.marketing.jsonc`. If the API also needs rollback, run `deploy-main-to-vps.yml` with the previous stable release tag and `deploy_action=live`. For a tag predating Worker support, set `deploy_worker=false`; the workflow uses an inline version-marker fallback and skips Worker deploys. Older refs without marketing files skip the marketing build and deploy. Set `deploy_vps_frontend=true` only when the VPS frontend is needed. Serving it requires an owner-side traffic-route change to send the app hostname to the VPS and disabling the legacy nginx redirect.

Production frontend deploys require `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `PRODUCTION_WORKER_SHARED_SECRET` in GitHub Actions. The workflow installs the same secret on both production Workers and in the VPS API environment so the marketing-to-app service binding can forward a verified client IP. Never print or commit secret values.

## VPS layout

```
/var/www/gfc/{releases/<v>,current->}            optional production frontend rollback copy
/var/www/gfc-staging/{releases/<v>,current->}    staging (beta-mode build)
/opt/gfc-analytics/{releases,current->,config/{production-release.json,.env},logs}
/opt/gfc-staging-analytics/   port 3008, own .env (never prod credentials)
/opt/gfc-beta-analytics/      beta API, pm2 process gfc-beta-analytics
```

Setup: `scripts/setup-vps.sh`; nginx `server/nginx.conf`, `server/nginx-staging.conf`. Optional timed rollout: `/etc/cron.d/gfc-rollout` runs `node release/check-rollout.mjs`; manual promote `bash /opt/gfc-analytics/current/release/promote-release.sh [--force]`. Emergency full deploy: set `"action": "live"` in `deploy/production-release.json`. Server capability switches live in `deploy/{beta,staging,production,common}-deployment-config.json` and are read from the ref being deployed. Validate with `node scripts/validate-production-release.mjs`.

Troubleshooting: [hosted-rollout](../operations/hosted-rollout.md).

## Secrets (names only)

`GH_PAT`, `OPENCODE_API_KEY`, `VITE_FIREBASE_*`, `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (web project), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCOUNT_ID`, `CF_ANALYTICS_API_TOKEN`, `TELEMETRY_HASH_SECRET`, `BETA_SSH_*`, `PROD_SSH_*`, `ADMIN_UID_ALLOWLIST`, `METRICS_HASH_SALT`, `STRIPE_*`, `FIREBASE_ADMIN_*`, `BETA_WORKER_SHARED_SECRET`, `PRODUCTION_WORKER_SHARED_SECRET` (same GitHub Actions and Worker value, copied into the VPS API environment), `TODOIST_API_TOKEN`. Never print or commit values. Deploy workflows copy `VITE_SENTRY_DSN` to `SENTRY_BROWSER_DSN` on the VPS for `/api/sentry-tunnel`.

## Other ops references

| Topic | Doc |
|-------|-----|
| Banner (`public/alert-banner.json`) | [alert-banner](../operations/alert-banner.md) |
| Firestore TTL (`processedStripeWebhookEvents` 30d, `adminMetricDedupes` 35d; set per Firebase project) | [firestore-retention](../operations/firestore-retention.md) |
| Firestore rules deploy/verify | [firestore-rules-deployment](../operations/firestore-rules-deployment.md), [firestore-rules-verification](../firestore-rules-verification.md) |
| Emergency disable | [emergency-feature-disable](../operations/emergency-feature-disable.md) |
| OpenCode bots (schedules, limits, turning off) | [opencode-maintenance](../operations/opencode-maintenance.md) |
| Todoist sync | [github-todoist-sync](../github-todoist-sync.md) |
| Telemetry | [telemetry operations](../operations/telemetry.md) |
| Support/privacy requests | [v1.7-support-and-privacy](../operations/v1.7-support-and-privacy.md) |
| Full release procedure | [release-workflow](../operations/release-workflow.md), [releasing-beta](../releasing-beta.md) |
