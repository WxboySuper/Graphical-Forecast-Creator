# Release workflow

GFC has one integration branch and separate stable production lines:

- `main` is the next-major integration line. It is the normal PR target and has no branch-title restriction.
- `stable/X.Y.x` is the production line for the `X.Y` release family.
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
- `### Stable X.Y.x hotfixes` for work landing on `stable/X.Y.x`.

The check compares the lane before and after the PR. Merely touching the changelog or changing a different lane does not satisfy the gate.

For eligible same-repository PRs targeting `main` or `stable/X.Y.x`, a `beta` or
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
3. Run **Bootstrap Stable Release Line** to create `stable/X.Y.x` at that exact approved main commit.
4. Run **Create Stable Release** manually from the stable branch. If the branch still has the beta package version (for example `1.7.0-beta.114`), the workflow converts it to the stable version (`1.7.0`), commits that package update to the stable branch, and then creates the release.

The stable GitHub Release starts with the curated changelog entry and may include GitHub's generated merged-PR notes afterward. Production deployment is activated by the published stable release. After publication, the workflow dispatches the same changelog audit against the selected `stable/X.Y.x` line; any corrective changelog update is proposed through a separate PR.

The stable branch is now the immutable production family. New work can continue on `main` without changing what production runs.

## Production hotfixes

For an urgent production fix:

1. Create a `hotfix/*` branch from the current `stable/X.Y.x` line.
2. Open a reviewed PR into that stable branch.
3. Add the fix to the `Stable X.Y.x hotfixes` changelog lane.
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

When a reviewed PR merges into a `stable/X.Y.x` branch, the
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
| `bootstrap-stable-release.yml` | Create the immutable `stable/X.Y.x` branch from the approved main commit |
| `release-stable.yml` | Create a stable or hotfix release |
| `opencode-changelog-audit.yml` | Manually or weekly compare code changes with the Unreleased changelog and open a corrective PR when needed; manual runs can set `baseline_ref` to bound the range |
| `deploy-staging.yml` | Manually deploy a rehearsal ref |
| `deploy-main-to-vps.yml` | Deploy a published stable release or selected ref |
| `forward-port-stable-fix.yml` | Carry stable fixes forward into `main` |
