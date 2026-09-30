# Beta release (Cloudflare Workers)

Beta is a **release channel** on `main`, not a branch. The **Release | Beta** workflow (`release-beta.yml`) is the single supported path to cut a beta version, publish a GitHub prerelease, deploy `beta.gfcweather.com` on the `gfc-beta` Worker, and smoke-test the live site.

The beta **API** remains on the existing VPS (`BETA_API_ORIGIN` in `cloudflare/wrangler.beta.jsonc`). This workflow does not rsync the frontend or analytics server to the VPS.

Deploys use `wrangler deploy` from GitHub Actions only. Cloudflare **Workers Builds** (Git-connected automatic deploys) are intentionally not enabled; observability for the `gfc-beta` Worker is configured in `cloudflare/wrangler.beta.jsonc` instead.

## Prerequisites

- Changes are merged on `main` with correct `CHANGELOG.md` entries under `### Next major / beta`.
- Repository secrets listed below are configured (most already exist for prior beta deploys).
- `GH_PAT` can push release commits to `main` (same as today’s stable/beta release flows).

## Run from the Actions UI (humans)

1. Open **Actions → Release | Beta → Run workflow**.
2. Set **confirmation** to `RELEASE-BETA`.
3. Optionally set **version** to an explicit `X.Y.Z-beta.N` (otherwise the workflow increments from the latest `v*-beta.*` tag for the current package base).
4. Optionally set **previous_tag** when GitHub’s generated PR notes should use a specific baseline tag.
5. Use **dry_run** to lint/test, compute the next version, promote the changelog in a throwaway workspace, build, and preview release notes **without** committing, tagging, deploying, or smoke-testing production beta.

## Run from the GitHub API (agents and automation)

Workflow file: `.github/workflows/release-beta.yml`

### GitHub CLI

```bash
gh workflow run release-beta.yml \
  -f confirmation=RELEASE-BETA \
  -f dry_run=false
```

With an explicit version:

```bash
gh workflow run release-beta.yml \
  -f confirmation=RELEASE-BETA \
  -f version=1.8.0-beta.6 \
  -f dry_run=false
```

Dry run:

```bash
gh workflow run release-beta.yml \
  -f confirmation=RELEASE-BETA \
  -f dry_run=true
```

### REST API (`workflow_dispatch`)

```http
POST /repos/{owner}/{repo}/actions/workflows/release-beta.yml/dispatches
```

```json
{
  "ref": "main",
  "inputs": {
    "confirmation": "RELEASE-BETA",
    "version": "",
    "previous_tag": "",
    "dry_run": false
  }
}
```

Use a token with `actions:write` and access to required secrets.

## What the workflow does

1. Checks out `main`, installs dependencies, runs `pnpm lint` and `pnpm test`.
2. Unless `dry_run` is true, runs the bounded **OpenCode changelog audit** (`opencode-changelog-audit.yml`) and blocks until the audit is **clean** (no open corrective changelog PR).
3. Computes the next beta version, promotes `### Next major / beta` into `## vX.Y.Z-beta.N`, bumps `package.json`, and pushes the commit to `main` via `GH_PAT` (force-with-lease). If `main` is protected without a bypass for that token, the push fails; fix branch protection or use an admin PAT—this workflow does not auto-merge a release PR today.
4. Creates the `vX.Y.Z-beta.N` tag and a **prerelease** on GitHub with curated changelog plus generated merged-PR notes.
5. Builds with beta Vite env vars, uploads Sentry source maps, and deploys with `wrangler deploy --config cloudflare/wrangler.beta.jsonc`.
6. Smoke-tests `https://beta.gfcweather.com/` (HTML + embedded app version) and `https://beta.gfcweather.com/api/capabilities/status` (HTTP 200).

Concurrency group: `beta-release` (only one release at a time).

## Roll back a bad Worker deploy

If deploy succeeded but smoke tests fail, the workflow logs:

```bash
pnpm dlx wrangler@4 rollback --config cloudflare/wrangler.beta.jsonc
```

Run that locally or in a one-off job with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Rolling back does not revert the Git tag or GitHub Release; fix forward with a new beta release if needed.

## Emergency redeploy without a new version

**Deploy beta to Cloudflare Workers** (`deploy-beta-workers.yml`) can still deploy an existing `main` commit or `v*-beta.*` tag. Prefer the full release workflow for normal cuts.

## Secrets and variables

| Name | Used for |
| --- | --- |
| `GH_PAT` | Push release commit to `main`; OpenCode changelog audit |
| `OPENCODE_API_KEY` | Final changelog audit before release |
| `VITE_FIREBASE_API_KEY` | Beta frontend build |
| `VITE_FIREBASE_AUTH_DOMAIN` | Beta frontend build |
| `VITE_FIREBASE_PROJECT_ID` | Beta frontend build |
| `VITE_FIREBASE_APP_ID` | Beta frontend build |
| `VITE_BETA_INVITE_PATH` | Beta frontend build |
| `VITE_SENTRY_DSN` | Beta frontend build + Sentry release |
| `VITE_UMAMI_HOST` | Beta analytics build |
| `VITE_UMAMI_BETA_WEBSITE_ID` | Beta analytics build |
| `VITE_UMAMI_PRODUCTION_WEBSITE_ID` | Beta analytics build |
| `SENTRY_AUTH_TOKEN` | Source map upload / verification |
| `SENTRY_ORG` | Source map upload / verification |
| `SENTRY_PROJECT` | Source map upload / verification |
| `CLOUDFLARE_API_TOKEN` | Wrangler deploy |
| `CLOUDFLARE_ACCOUNT_ID` | Wrangler deploy |

`github.token` is used to create the GitHub Release (no extra secret).

Legacy beta VPS deploy secrets (`BETA_SSH_*`, `BETA_INVITE_TOKEN`, server billing secrets, etc.) are **not** used by this workflow.
