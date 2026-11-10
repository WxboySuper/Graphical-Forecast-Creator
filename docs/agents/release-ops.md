# Release and deploy operations

Do not run release/deploy workflows unless the owner asks. Procedures here are condensed; authoritative detail is in the linked docs.

## Model

- `main` = next-major line. `stable/X.Y.x` = production. Beta = prerelease cut from `main` (not a branch). Merging deploys nothing.
- Targets: `local`, `beta` (beta.gfcweather.com, Cloudflare Worker `gfc-beta` + VPS API at `/opt/gfc-beta-analytics`), `staging` (staging-gfc.weatherboysuper.com), `production` (gfc.weatherboysuper.com).
- Old docs/comments may say `beta-gfc.weatherboysuper.com`; the Cloudflare config uses `beta.gfcweather.com`.

## Workflows

| Workflow | Purpose | Key inputs |
|----------|---------|-----------|
| `release-beta.yml` | Full beta cut, run on `main`; also runs every six hours (started by the `gfc-mesoscale-scheduler` Cloudflare cron with `only_if_changed`, with GitHub's own schedule as a backup) and only proceeds when `main` has commits since the last beta tag. Deploys the `gfc-mesoscale` Worker when `MESOSCALE_WORKER_URL` is set | `confirmation=RELEASE-BETA`, `dry_run`, `deploy_api`, `only_if_changed`, optional `version` (`X.Y.Z-beta.N`), `previous_tag` |
| `deploy-beta-workers.yml` | Redeploy existing ref to Worker | `ref=vX.Y.Z-beta.N` |
| `prepare-stable-promotion.yml` | Promotion PR into `main` | reviewed `main` ref, target version |
| `bootstrap-stable-release.yml` | Create `stable/X.Y.x` at the approved main commit | |
| `release-stable.yml` | Stable/hotfix release; publishing triggers production deploy | run from the stable branch; converts `-beta.N` package version to stable |
| `deploy-staging.yml` | Manual rehearsal of any branch/tag/commit | |
| `deploy-main-to-vps.yml` | Production/staging VPS deploy | |
| `forward-port-stable-fix.yml` | Stable merge -> draft `port/<pr>-to-main` PR or `porting/conflicts` issue | |
| `opencode-changelog-audit.yml` | Changelog vs code audit (weekly + release preflight) | `baseline_ref` bounds range |

Beta release notes list only the pull requests merged since the previous beta tag (`RELEASE_NOTES_MODE: prs`, previous beta found automatically or from `previous_tag`) and link to the full changelog; the full v1.8 changelog belongs to the stable release (`changelog-and-prs`).

Beta example: `gh workflow run release-beta.yml --ref main -f confirmation=RELEASE-BETA -f dry_run=false -f deploy_api=true`. Concurrency group `beta-release`. Beta cuts only bump `package.json`; `CHANGELOG.md` is not rewritten.

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

Stable: Prepare Main Stable Promotion -> merge PR -> Bootstrap Stable Release Line -> Create Stable Release (from stable branch). Hotfix: `hotfix/*` from stable -> PR into stable + hotfix changelog lane -> Deploy Staging with that ref -> merge -> Create Stable Release -> forward-port PR appears. Forward-port PRs use `Changelog-Impact: inherited` + `Port of #N`.

GitHub Release notes: beta = native PR list + changelog link; stable = curated changelog + PR list; hotfix = curated hotfix entry + short PR list.

## VPS layout

```
/var/www/gfc/{releases/<v>,current->}            production frontend
/var/www/gfc-staging/{releases/<v>,current->}    staging (beta-mode build)
/opt/gfc-analytics/{releases,current->,config/{production-release.json,.env},logs}
/opt/gfc-staging-analytics/   port 3008, own .env (never prod credentials)
/opt/gfc-beta-analytics/      beta API, pm2 process gfc-beta-analytics
```

Setup: `scripts/setup-vps.sh`; nginx `server/nginx.conf`, `server/nginx-staging.conf`. Optional timed rollout: `/etc/cron.d/gfc-rollout` runs `node release/check-rollout.mjs`; manual promote `bash /opt/gfc-analytics/current/release/promote-release.sh [--force]`. Emergency full deploy: set `"action": "live"` in `deploy/production-release.json`. Server capability switches live in `deploy/{beta,staging,production,common}-deployment-config.json` and are read from the ref being deployed. Validate with `node scripts/validate-production-release.mjs`.

Troubleshooting: [hosted-rollout](../operations/hosted-rollout.md).

## Secrets (names only)

`GH_PAT`, `OPENCODE_API_KEY`, `VITE_FIREBASE_*`, `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (web project), `VITE_UMAMI_*`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BETA_SSH_*`, `PROD_SSH_*`, `ADMIN_UID_ALLOWLIST`, `METRICS_HASH_SALT`, `STRIPE_*`, `FIREBASE_ADMIN_*`, `BETA_WORKER_SHARED_SECRET` (identical in GitHub and Worker; set Worker side with `pnpm dlx wrangler@4 secret put BETA_WORKER_SHARED_SECRET --config cloudflare/wrangler.beta.jsonc`), `TODOIST_API_TOKEN`. Never print or commit values. Deploy workflows copy `VITE_SENTRY_DSN` to `SENTRY_BROWSER_DSN` on the VPS for `/api/sentry-tunnel`.

## Other ops references

| Topic | Doc |
|-------|-----|
| Banner (`public/alert-banner.json`) | [alert-banner](../operations/alert-banner.md) |
| Firestore TTL (`processedStripeWebhookEvents` 30d, `adminMetricDedupes` 35d; set per Firebase project) | [firestore-retention](../operations/firestore-retention.md) |
| Firestore rules deploy/verify | [firestore-rules-deployment](../operations/firestore-rules-deployment.md), [firestore-rules-verification](../firestore-rules-verification.md) |
| Emergency disable | [emergency-feature-disable](../operations/emergency-feature-disable.md) |
| OpenCode bots (schedules, limits, turning off) | [opencode-maintenance](../operations/opencode-maintenance.md) |
| Todoist sync | [github-todoist-sync](../github-todoist-sync.md) |
| Umami | [umami-telemetry](../operations/umami-telemetry.md), [privacy ops](../operations/umami-telemetry-privacy-operations.md) |
| Support/privacy requests | [v1.7-support-and-privacy](../operations/v1.7-support-and-privacy.md) |
| Full release procedure | [release-workflow](../operations/release-workflow.md), [releasing-beta](../releasing-beta.md) |
