# Release workflow

GFC has one integration branch and separate stable production lines:

- `main` is the next-major integration line. It is the normal PR target and has no branch-title restriction.
- `stable/X.x` is the production line for a flat major release family such as `stable/2.x`.
- `beta` is no longer an integration branch. It is retired after the cutover is complete.

Nothing deploys merely because a PR merges. Releases and deployments are intentional manual actions.

## Normal development

Open a PR from any suitable source branch into `main`, review it, pass CI, and merge it. Large next-major work can live on `main` even while production remains on a stable line.

The required changelog check asks every PR to declare exactly one decision:

```md
Changelog-Impact: beta
```

or:

```md
Changelog-Impact: hotfix
```

For changes with no public product impact:

```md
Changelog-Impact: none
Changelog-Reason: CI/tooling-only change.
```

The PR must change the matching lane in `CHANGELOG.md` when the impact is `beta` or `hotfix`:

- `### Next major / beta` for work landing on `main`.
- The stable-line hotfix lane for work landing on the current `stable/X.x` branch.

The check compares the lane before and after the PR. Merely touching the changelog or changing a different lane does not satisfy the gate.

For eligible same-repository PRs targeting `main` or `stable/X.x`, a `beta` or
`hotfix` decision is enough to request an automatic entry. The trusted
`pull_request_target` changelog workflow runs a bounded, read-only OpenCode draft
when the PR has not already changed `CHANGELOG.md`. OpenCode receives the PR
title, description, bounded diff, and read-only repository checkout. It returns one to four factual bullets;
deterministic code validates their format, section, size, selected lane, and
current PR head before adding them and pushing a normal commit to the PR branch.
The normal changelog policy then validates the generated entry. Setting `none`
with a reason or `inherited` skips generation. PRs from forks, oversized diffs,
inconclusive model results, stale revisions, or branch-protection push failures
still require a human-authored entry or a corrected decision.

The workflow runs as `pull_request_target` and checks out its scripts from the
repository default branch before checking out PR content. PR checkout credentials
are not persisted. The model receives no GitHub token and cannot edit files or
run commands. Trusted metadata-preparation and publisher steps use `GH_PAT`
only to update eligible PR metadata or authenticate fetch/push to the PR branch. Protected-branch rules, merges, releases, and
deployments remain outside this job. Editing the PR description also starts the
validation flow when a changelog declaration is added.

## Dependabot updates

The trusted changelog workflow prepares eligible Dependabot PR metadata. When it
pushes a changelog commit, the updated revision triggers the required CI checks.

1. The workflow identifies the dependency update.
2. It updates the PR description with a managed changelog declaration.
3. Runtime or security dependency changes receive a generated `Dependencies` entry in the correct changelog lane.
4. Tooling-only updates receive `Changelog-Impact: none` and an automated reason.
5. The workflow commits the changelog update to the PR branch, which triggers the required governance check on the new revision.

The automation is idempotent, so retries replace the managed declaration instead of adding duplicates.

## Beta releases

Beta is a release channel on `main`, not a branch. Use **Release | Beta** (`release-beta.yml`) for the full cut: OpenCode changelog audit, version and changelog promotion, GitHub prerelease, Cloudflare Workers deploy to `beta.gfcweather.com`, and smoke tests. See [releasing-beta.md](../releasing-beta.md) for UI, API, rollback, and secrets.

For redeploying an existing ref without a new version, use **Deploy beta to Cloudflare Workers**.

## Stable major promotion

To promote the next-major line to production:

1. Run **Prepare Main Stable Promotion** with the reviewed `main` ref and target version.
2. Review and merge the generated promotion PR into `main`.
3. Run **Bootstrap Stable Release Line** to create `stable/X.x` at that exact approved main commit.
4. Run **Create Stable Release** manually from the stable branch. If the branch still has a beta package version (for example `2.0.0-beta.16`), the workflow converts it to `2.0.0`, commits that package update to the stable branch, and creates tag `v2.0.0` with the short display label `v2`.

The stable GitHub Release title uses the short label, such as `v2` or `v2.1`; its git tag uses padded semver, such as `v2.0.0` or `v2.1.0`. The release starts with the curated changelog entry and may include GitHub's generated merged-PR notes. Publishing triggers the production workflow. For a live manifest action, it deploys the VPS API and `gfc-production` Cloudflare Worker frontend, then smoke-checks the production hostname and version marker. The VPS frontend is not deployed by default. After publication, the workflow dispatches the same changelog audit against the selected stable branch, such as `stable/2.x`; any corrective changelog update is proposed through a separate PR.

The stable branch is now the immutable production family. New work can continue on `main` without changing what production runs.

## Production hotfixes

For an urgent production fix:

1. Create a `hotfix/*` branch from the current `stable/X.x` line.
2. Open a reviewed PR into that stable branch.
3. Add the fix to the current stable-line hotfix changelog lane.
4. Run **Deploy Staging** with the hotfix branch, commit, or PR ref.
5. After staging verification, merge the hotfix PR.
6. Run **Create Stable Release** for the stable line.

The hotfix release uses the curated hotfix entry first, followed by the merged-PR traceability notes. Publishing it activates production deployment.

## Stable fix forward-porting

When a stable PR merges, **Forward-port Stable Fix** attempts to express the production fix on `main` using the stable merge diff. It creates a normal reviewed `port/<pr>-to-main` PR and never merges it automatically.

If the diff cannot be applied safely because `main` has moved substantially, the workflow opens a tracking issue instead of forcing a misleading PR. The issue explains the stable source, merge commit, affected files, and the need to re-express the behavior in the next-major architecture.

A successful manual forward-port uses:

```md
Changelog-Impact: inherited
Port of #123
```

The forward-port does not create a second public changelog entry.

## Staging

**Deploy Staging** is manual and accepts a branch, tag, or commit. It is the rehearsal surface for both `main` next-major work and stable hotfixes. It never runs on ordinary pushes, merges, or release creation.

## Release-note audience

`CHANGELOG.md` is written for GFC users and is the source used for the website and social announcements.

GitHub Release notes are for people who want repository-level traceability:

| Release type | Primary notes | Additional notes |
| --- | --- | --- |
| Beta | Native merged-PR list | Link to curated changelog |
| Stable major | Curated changelog | Native merged-PR list |
| Stable hotfix | Curated hotfix entry | Short native merged-PR list |

The release script resolves the previous tag from the same release history, or accepts an operator-provided override. GitHub's generated notes therefore describe the exact release range rather than a time window.

## Stable fixes forward-port into main

When a reviewed PR merges into a `stable/X.x` branch, the
`Forward-port Stable Fix` workflow prepares a normal draft PR from the stable
merge into `main`. It applies the trusted merge commit's diff to the current
`main` branch; it never checks out or executes code from the original PR head,
and it never merges the port automatically.

If the diff applies cleanly, review the generated `port/<pr>-to-main` PR like
any other change. If the architectures have diverged, the workflow creates a
`porting/conflicts` issue instead. Re-express the stable behavior manually on
`main`, then include `Changelog-Impact: inherited` and `Port of #<stable-pr>`
when the stable changelog entry is carried forward.

## Manual workflows

| Workflow | Purpose |
| --- | --- |
| `release-beta.yml` | Version, release, build, and deploy a beta prerelease from `main` |
| `prepare-stable-promotion.yml` | Create a reviewed main promotion PR |
| `bootstrap-stable-release.yml` | Create the immutable `stable/X.x` branch from the approved main commit |
| `release-stable.yml` | Create a stable or hotfix release |
| `opencode-changelog-audit.yml` | Manually or weekly compare code changes with the Unreleased changelog and open a corrective PR when needed; manual runs can set `baseline_ref` to bound the range |
| `deploy-staging.yml` | Manually deploy a rehearsal ref |
| `deploy-main-to-vps.yml` | Deploy the production Worker frontend and VPS API, or manually deploy a selected stable ref; VPS frontend is an opt-in rollback path |
| `forward-port-stable-fix.yml` | Carry stable fixes forward into `main` |

## Production Cloudflare cutover

Complete these owner-side steps before publishing the first v2 stable release, currently targeted for Saturday, 2026-11-21. This repo does not change DNS, Cloudflare account settings, Firebase, Stripe, Google OAuth, Sentry, or Umami.

1. In Cloudflare, confirm the `gfcweather.com` zone and DNS records cover `app.gfcweather.com`, the apex, and `www`. Confirm TLS for all three names.
2. Configure the `gfc-production` custom domain for `app.gfcweather.com`, and the `gfc-marketing` custom domains for `gfcweather.com` and `www.gfcweather.com`. Check [`cloudflare/wrangler.production.jsonc`](../../cloudflare/wrangler.production.jsonc) and [`cloudflare/wrangler.marketing.jsonc`](../../cloudflare/wrangler.marketing.jsonc). The marketing Worker sends `www` to the apex and legacy app routes to `app.gfcweather.com`.
3. In Firebase Authentication, add `app.gfcweather.com` to Authorized domains. Keep the apex and `www` entries during transition if existing sign-in callbacks still use them. Check the configured Firebase auth domain.
4. In Google OAuth, authorize the app origin `https://app.gfcweather.com` and the marketing origins `https://gfcweather.com` and `https://www.gfcweather.com` as needed. Keep the Firebase handler redirect URI authorized.
5. In Stripe, set checkout and billing portal return URLs to `https://app.gfcweather.com`. Verify webhook delivery still reaches the VPS API through the apex `/api/*` service binding or the configured legacy endpoint. Keep any old return URLs needed during transition.
6. Set production API `APP_BASE_URL=https://app.gfcweather.com`. Confirm `CORS_ALLOWED_ORIGINS` on the mesoscale Worker and `FEEDBACK_ALLOWED_ORIGINS` on the feedback Worker both include `https://app.gfcweather.com` and `https://gfcweather.com` during transition. The Express API has no browser CORS allowlist; browser API calls use the same-origin app Worker. The marketing Worker forwards apex `/api/*` through its `APP_WORKER` binding to `gfc-production`.
7. Add `app.gfcweather.com` and `gfcweather.com` to Sentry and Umami domain settings. Keep `telemetry.gfc.weatherboysuper.com` and the `/api/sentry-tunnel` route available.
8. Set GitHub Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `PRODUCTION_WORKER_SHARED_SECRET`. The deploy workflow installs the same shared secret on the app Worker, marketing Worker, and VPS API. Do not copy secret values into the repo.
9. Rehearse the app and marketing Workers on non-production hosts with production build settings and a safe API target. Check app routes, pricing/updates pages, 404 handling, assets, caches, API status, sentry tunnel, Firebase sign-in, Stripe returns, webhooks, and version marker.
10. Install [`server/nginx-legacy-redirect.conf`](../../server/nginx-legacy-redirect.conf) on the VPS. Keep valid TLS for `gfc.weatherboysuper.com`. It sends old page requests to `app.gfcweather.com` and preserves `/api/*` and `/api/sentry-tunnel` for API traffic.
11. Run **Create Stable Release** from `stable/2.x`. The deploy workflow updates `gfc-production` before building and deploying `gfc-marketing`, then checks `https://app.gfcweather.com/version.json` and both public hosts.
12. Roll back the app Worker with `wrangler rollback --config cloudflare/wrangler.production.jsonc` and marketing with `wrangler rollback --config cloudflare/wrangler.marketing.jsonc`. To roll back the API, dispatch `deploy-main-to-vps.yml` with the previous stable tag and `deploy_action=live`. Older tags without marketing files skip marketing build/deploy steps. Serving a VPS frontend still requires an owner-side route change and disabling the nginx legacy redirect.
13. Verify the app hostname, apex `www` redirect, legacy app redirects with queries, apex API forwarding, auth callbacks, Stripe checkout/portal/webhooks, Sentry and Umami events, marketing 404s and caching, and the API status route.

Open decisions before cutover:

- Confirm the legacy hostname will remain a stable VPS API origin after its page requests redirect. The app Worker still depends on that split behavior.
- Decide how timed `production-release.json` rollouts should activate the Worker. The VPS cron still promotes VPS symlinks only; it does not schedule Worker releases.
- Confirm whether Stripe webhooks target the legacy hostname or apex `/api/*`, and keep the selected endpoint working during the transition.
