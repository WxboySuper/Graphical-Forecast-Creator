# Beta release (Cloudflare Workers)

Beta is a **release channel** on `main`, not a branch. The **Release | Beta** workflow (`release-beta.yml`) is the single supported path to cut a beta version, publish a GitHub prerelease, deploy `beta.gfcweather.com` on the `gfc-beta` Worker, deploy the beta API on the VPS, smoke-test the live site, and publish the release.

The beta **API** (`/api/*` proxied by the Worker) runs on the existing VPS at `/opt/gfc-beta-analytics`. The workflow rsyncs `server/` there (excluding `.env`) and restarts `gfc-beta-analytics` when **`deploy_api`** is `true` (default). It does **not** rsync the retired static frontend to `/var/www/gfc-beta`.

Deploys use `wrangler deploy` from GitHub Actions only. Cloudflare **Workers Builds** (Git-connected automatic deploys) are intentionally not enabled; observability for the `gfc-beta` Worker is configured in `cloudflare/wrangler.beta.jsonc` instead.

## Prerequisites

- Run the workflow from the `main` branch ref.
- Changes on `main` include user-facing notes under `### Next major / beta` in `CHANGELOG.md` (the file is not rewritten on beta cuts; only `package.json` is bumped).
- Repository secrets listed below are configured.
- `GH_PAT` can push the release commit and release tag to `main`.

## Run from the Actions UI (humans)

1. Open **Actions → Release | Beta → Run workflow** (branch: `main`).
2. Set **confirmation** to `RELEASE-BETA`.
3. Optionally set **version** to an explicit `X.Y.Z-beta.N` (must be newer than the latest tag and not already tagged).
4. Optionally set **previous_tag** for generated merged-PR release notes.
5. Set **deploy_api** to `false` to skip the VPS API deploy (Worker deploy still runs).
6. Use **dry_run** to lint/test, resolve the version, validate the changelog lane, run a pre-build without Sentry upload, and preview **changelog-only** release notes (the dry-run job has `contents: read`, so GitHub cannot generate merged-PR notes).

## Run from the GitHub API (agents and automation)

```bash
gh workflow run release-beta.yml \
  --ref main \
  -f confirmation=RELEASE-BETA \
  -f dry_run=false \
  -f deploy_api=true
```

## What the workflow does

1. On `main`, runs `pnpm lint` and `pnpm test`.
2. Unless `dry_run`, runs the bounded **OpenCode changelog audit** and requires a **clean** result.
3. Resolves the next beta version and validates the next-major changelog lane (comments and empty headings do not count as content).
4. **Pre-build** on `main` with the target version applied locally (no Sentry upload) before any tag is created.
5. Unless `dry_run`, commits **only** `package.json` when it changes (retry of an untagged version reuses the current `main` commit), pushes to `main`, creates and pushes the annotated **`vX.Y.Z-beta.N` git tag** with `GH_PAT`, then creates a **draft** GitHub prerelease with `--verify-tag`. Release notes use the **next-major lane** from `CHANGELOG.md`.
6. Checks out the new tag, builds with Sentry source maps, deploys the Worker, optionally deploys the VPS API, then smoke-tests `/`, `/version.json`, and `/api/capabilities/status` (with retries).
7. Publishes the draft GitHub prerelease after smoke tests pass.

Concurrency group: `beta-release`.

## Recover from a failed run

| Situation | What to do |
| --- | --- |
| Worker deploy failed after the tag exists | Run **Deploy beta to Cloudflare Workers** with `ref=vX.Y.Z-beta.N`, or `wrangler rollback` for the Worker. |
| VPS API deploy failed | Re-run only the API steps manually, or run **Deploy beta to Cloudflare Workers** is **not** enough for API—use SSH/rsync from the workflow’s `deploy_beta_api` job as a template. Do **not** rerun the full **Release \| Beta** workflow unless you intend to cut a **new** version. |
| Smoke tests failed | Fix the site, redeploy with `deploy-beta-workers.yml` and `ref=vX.Y.Z-beta.N`. Worker rollback command is logged in the workflow. |
| Draft GitHub release left open | After fixing deploy, either let a successful run reach **publish_release**, or in GitHub **Releases** publish the draft manually, or delete the draft if abandoning that version. |
| Tag exists but release abandoned | Delete the erroneous tag and draft release in GitHub before retrying the same version. |

The git tag is created **before** deploy (when the draft release is created), so `ref=v<version>` recovery works even while the GitHub release is still a draft.

## Secrets and variables

| Name | Used for |
| --- | --- |
| `GH_PAT` | Push release commit and tag; OpenCode changelog audit |
| `OPENCODE_API_KEY` | Final changelog audit |
| `VITE_FIREBASE_*` | Beta frontend build |
| `BETA_INVITE_PATH` | Beta frontend build (`VITE_BETA_INVITE_PATH` in the build step) |
| `VITE_SENTRY_DSN` | Beta frontend build |
| `VITE_UMAMI_*` | Beta analytics build |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Deploy build source maps (not dry-run pre-build) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Wrangler deploy |
| `BETA_SSH_KEY`, `BETA_SSH_HOST`, `BETA_SSH_KNOWN_HOSTS` | VPS API deploy (`deploy_api`) |
| `BETA_INVITE_TOKEN`, `ADMIN_UID_ALLOWLIST`, `METRICS_HASH_SALT` | VPS API env |
| `STRIPE_*`, `FIREBASE_ADMIN_*`, `SENTRY_DSN` | VPS API env |

`github.token` creates and publishes the GitHub Release.
