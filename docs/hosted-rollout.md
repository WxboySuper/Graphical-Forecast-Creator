# Hosted production rollout (timed stage + promote)

Ops companion to [timed-production-rollout.md](./timed-production-rollout.md).

## VPS layout

```text
/var/www/gfc/
  releases/<version>/
  current -> releases/<live-version>

/var/www/gfc-staging/
  releases/<version>/    # beta-mode build for smoke tests
  current -> releases/<staged-version>

/opt/gfc-analytics/
  releases/<version>/
  current -> releases/<live-version>
  config/production-release.json
  config/.env              # production analytics env (copied into release on promote)
  logs/

/opt/gfc-staging-analytics/   # beta-gated API on port 3008 for staging-gfc preview
  releases/<version>/         # separate copy from prod (not symlinked to gfc-analytics)
  current -> releases/<staged-version>
  config/.env                 # staging-only credentials (never prod .env)
  logs/
```

## One-time setup

1. Run `scripts/setup-vps.sh` on the production VPS (creates dirs + cron).
2. Point production nginx at `server/nginx.conf` (`root` = `/var/www/gfc/current`).
3. Enable `server/nginx-staging.conf` for `staging-gfc.weatherboysuper.com`.
4. Ensure GitHub secrets: `PROD_SSH_*`, `BETA_INVITE_PATH`, `BETA_INVITE_TOKEN` (staging uses same invite gate as beta).

## Cron promote

`/etc/cron.d/gfc-rollout` runs every minute:

```bash
cd /opt/gfc-analytics/current && node release/check-rollout.mjs
```

Manual promote (after `rolloutAt` or emergency):

```bash
bash /opt/gfc-analytics/current/release/promote-release.sh
# or --force to ignore rolloutAt / already-live guard
```

## Release author flow

1. Promotion PR (`beta` → `main`) updates `deploy/production-release.json`:
   - `action`: `"stage"`
   - `rolloutAt`: ISO UTC instant
   - `releaseId`: unique per attempt
   - `banner.phases`: pre-rollout + post-rollout
2. Merge → **Deploy Production to VPS** stages build; **live site stays on previous `current`**.
3. Smoke **staging-gfc** (beta access guard, same as beta-gfc).
4. At `rolloutAt`, cron promotes; live banner switches via `write-live-alert-banner.mjs`.

## Hotfix / emergency

Set `"action": "live"` in `deploy/production-release.json` for immediate full deploy (no staging).

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Deploy rejected | `node scripts/validate-production-release.mjs` locally; version vs `package.json` |
| Live updated early | `action` must be `stage`; verify `current` symlink on VPS |
| Staging 403 / beta gate | Sign in + beta access; use invite URL |
| Promote did not run | `config/status`, `rolloutAt`, `/opt/gfc-analytics/logs/rollout-cron.log` |
| `/updates` or `/updates/` returns **403** on direct URL | `public/updates/` exists for screenshots; nginx must use exact `location = /updates` blocks in `server/nginx.conf` (see repo). In-app NavLink/banner links work without this because React Router never requests the path from nginx. |
