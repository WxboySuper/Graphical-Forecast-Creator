# Beta release (Cloudflare Workers)

Beta is a **release channel** on `main`, not a branch. The **Release | Beta** workflow (`release-beta.yml`) is the single supported path to cut a beta version, publish a GitHub prerelease, deploy `beta.gfcweather.com` on the `gfc-beta` Worker, deploy the beta API on the VPS, smoke-test the live site, and publish the release.

The beta **API** (`/api/*` proxied by the Worker) runs on the existing VPS at `/opt/gfc-beta-analytics`. The workflow rsyncs `server/` there and restarts `gfc-beta-analytics` unless `deploy_api` is set to `false`. It does **not** rsync the retired static frontend to `/var/www/gfc-beta`.

Deploys use `wrangler deploy` from GitHub Actions only. Cloudflare **Workers Builds** (Git-connected automatic deploys) are intentionally not enabled; observability for the `gfc-beta` Worker is configured in `cloudflare/wrangler.beta.jsonc` instead.

## Prerequisites

- Run the workflow from the `main` branch ref.
- Changes on `main` include user-facing notes under `### Next major / beta` in `CHANGELOG.md` (the file is not rewritten on beta cuts; only `package.json` is bumped).
- Repository secrets listed below are configured.
- `GH_PAT` can push the release commit to `main`.

## Run from the Actions UI (humans)

1. Open **Actions → Release | Beta → Run workflow** (branch: `main`).
2. Set **confirmation** to `RELEASE-BETA`.
3. Optionally set **version** to an explicit `X.Y.Z-beta.N` (must be newer than the latest tag and not already tagged).
4. Optionally set **previous_tag** for generated merged-PR release notes.
5. Set **deploy_api** to `false` to skip the VPS API deploy (Worker deploy still runs).
6. Use **dry_run** to lint/test, resolve the version, validate the changelog lane, run a pre-build without Sentry upload, and preview release notes **without** committing, tagging, deploying, or publishing.

## Run from the GitHub API (agents and automation)

Workflow file: `.github/workflows/release-beta.yml`

### GitHub CLI

```bash
gh workflow run release-beta.yml \
  --ref main \
  -f confirmation=RELEASE-BETA \
  -f dry_run=false \
  -f deploy_api=true
```

### REST API (`workflow_dispatch`)

```json
{
  "ref": "main",
  "inputs": {
    "confirmation": "RELEASE-BETA",
    "version": "",
    "previous_tag": "",
    "dry_run": false,
    "deploy_api": true
  }
}
```

## What the workflow does

1. On `main`, runs `pnpm lint` and `pnpm test`.
2. Unless `dry_run`, runs the bounded **OpenCode changelog audit** and requires a **clean** result.
3. Resolves the next beta version and validates the next-major changelog lane (comments and empty headings do not count as content).
4. **Pre-build** on `main` with the target version applied locally (no Sentry upload) before any tag is created.
5. Unless `dry_run`, commits **only** `package.json`, pushes to `main`, and creates a **draft** GitHub prerelease targeting that commit SHA. Release notes use the **next-major lane** from `CHANGELOG.md` (unchanged on disk).
6. Checks out the new tag, builds with Sentry source maps, deploys the Worker, optionally deploys the VPS API, then smoke-tests:
   - `https://beta.gfcweather.com/` (HTML),
   - `https://beta.gfcweather.com/version.json` (build-time `version` field),
   - `https://beta.gfcweather.com/api/capabilities/status` (HTTP 200), with retries.
7. Publishes the draft GitHub prerelease after smoke tests pass.

Concurrency group: `beta-release`.

## Recover when deploy fails after the tag exists

The git tag and draft GitHub release are created before deploy. If the Worker deploy fails or smoke tests fail:

- **Redeploy the same version:** run **Deploy beta to Cloudflare Workers** with `ref=vX.Y.Z-beta.N` (or `gh workflow run deploy-beta-workers.yml -f ref=vX.Y.Z-beta.N`).
- **Roll back the Worker:** `pnpm dlx wrangler@4 rollback --config cloudflare/wrangler.beta.jsonc` (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`).
- **API-only issues:** rerun **Release | Beta** is not required; fix the VPS and re-run with `deploy_api=true` or deploy `server/` manually using the same steps as `deploy_beta_api`.

Publishing stays blocked until smoke tests pass, so a failed run leaves a **draft** prerelease.

## Secrets and variables

| Name | Used for |
| --- | --- |
| `GH_PAT` | Push release commit to `main`; OpenCode changelog audit |
| `OPENCODE_API_KEY` | Final changelog audit |
| `VITE_FIREBASE_*` | Beta frontend build |
| `BETA_INVITE_PATH` | Beta frontend build (`VITE_BETA_INVITE_PATH` env in CI) |
| `VITE_SENTRY_DSN` | Beta frontend build |
| `VITE_UMAMI_*` | Beta analytics build |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Production deploy build source maps (not used in `dry_run` pre-build) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Wrangler deploy |
| `BETA_SSH_KEY`, `BETA_SSH_HOST`, `BETA_SSH_KNOWN_HOSTS` | VPS API deploy (`deploy_api`) |
| `BETA_INVITE_TOKEN`, `ADMIN_UID_ALLOWLIST`, `METRICS_HASH_SALT` | VPS API env |
| `STRIPE_*`, `FIREBASE_ADMIN_*`, `SENTRY_DSN` | VPS API env |

`github.token` creates and publishes the GitHub Release.
