# Release workflow

Your normal flow stays simple: **open a PR, review it, click merge**. Automation handles versions, changelog gates, labels, GitHub Releases, and beta prerelease bumps.

## Your day-to-day (short answer)

| Goal | What you do |
|------|-------------|
| Feature work | Prefer `feature/*` or `fix/*` → PR into **beta** → merge (other branch names are allowed except `hotfix/*`) |
| Promote to production | PR **beta → main** → merge (nothing else required) |
| Production hotfix | Branch `hotfix/*` → PR into **main** → merge (GitHub Release created automatically) |

After merge, **Post-merge automation** runs on its own (no Actions button).

## What happens when you merge

### beta → main (promotion)

1. You merge the **beta → main** PR (same as today).
2. **Post-merge automation** (`post-merge-automation.yml`):
   - Strips `-beta` from `package.json` on `main` (e.g. `1.6.0-beta.3` → `1.6.0`) and pushes.
   - Creates a **GitHub Release** `v1.6.0` using the matching section in `CHANGELOG.md`.
   - Bumps **beta** to the next line (e.g. `1.7.0-beta.1`) for continued development.
3. **Deploy Production to VPS** runs on the push to `main` (Sentry release uses the **stable** version even if the merge commit still had `-beta` briefly).

### Integrations → beta

- Preferred: `feature/*` and `fix/*` (labeled `integration:primary`).
- Other branch names are allowed into beta except `hotfix/*` (labeled `integration:other`).
- Automation increments the beta prerelease on each merge: `1.6.0-beta.1` → `1.6.0-beta.2`, etc.
- Port branches (`port/*`) skip the version bump.

### hotfix/* → main

- Automation bumps the **patch** on `main` after merge (e.g. `1.6.0` → `1.6.1`).
- Creates a **GitHub Release** for the new patch version from `CHANGELOG.md`.

## Branch rules (enforced in CI)

| Head branch | Base branch | Allowed |
|-------------|-------------|---------|
| `feature/*` | `beta` | Yes (preferred) |
| `fix/*` | `beta` | Yes (preferred) |
| Other names (not `hotfix/*`) | `beta` | Yes |
| `hotfix/*` | `main` | Yes |
| `beta` | `main` | Yes (promotion) |
| `feature/*`, `fix/*`, other | `main` | **Blocked** |
| `hotfix/*` | `beta` | **Blocked** |

`main` and `beta` are protected; direct pushes are already restricted.

## Version policy

| Branch | `package.json` |
|--------|----------------|
| `beta` | Must include `-beta.N` (e.g. `1.6.0-beta.2`) |
| `main` | Stable semver only (e.g. `1.6.0`) |
| PR **beta → main** | May show `-beta` on the PR; stripped automatically after merge |

## Changelog

For PRs into **beta** (feature/fix) and **hotfix → main**:

- Edit `CHANGELOG.md` in the PR, **or**
- Add a `## Changelog` section with bullets in the PR description.

**beta → main** promotion PRs skip the file check (verify the release section in CHANGELOG before merge).

## PR labels (automatic)

`pr-governance.yml` manages labels such as:

- `promotion`, `feature`, `fix`, `hotfix`
- `has conflicts`, `draft`
- `ci:pending`, `ci:passing`, `ci:failing`

Create these labels in the repo once (any color); the workflow applies them on each PR.

## Optional / legacy workflows

| Workflow | When to use |
|----------|-------------|
| **Prepare Beta → Main Release PR** | Optional alternate path using `release/v*` branches (not required if you use beta → main PR). |
| **Bump beta for next development cycle** | Manual override if post-merge bump did not run. |
| **(Legacy) Direct promote beta → main** | Emergency only (`LEGACY-DIRECT-PROMOTE`); bypasses PR review. |

## Required secret

- **GH_PAT** — same token as PR porting (`repo` scope), used for post-merge commits and releases.

## Local scripts

| Script | Purpose |
|--------|---------|
| `node scripts/validate-branch-policy.mjs` | Branch routing check |
| `node scripts/validate-package-version.mjs` | Version policy check |
| `node scripts/check-changelog-pr.mjs` | Changelog check |
| `node --test scripts/lib/package-version.test.mjs` | Policy unit tests |
