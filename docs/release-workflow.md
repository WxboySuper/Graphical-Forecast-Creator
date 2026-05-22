# Release workflow (beta → main)

## Branch version policy

| Branch | `package.json` version | Sentry `environment` | Sentry `release` |
|--------|------------------------|----------------------|------------------|
| `beta` | Must include `-beta` (e.g. `1.6.0-beta.1`) | `beta` | `graphical-forecast-creator@1.6.0-beta.1` |
| `main` | Stable semver only (e.g. `1.6.0`) | `production` | `graphical-forecast-creator@1.6.0` |

CI enforces this on pushes and pull requests targeting `beta` or `main`.

## Why

Beta and main previously shared the same version (`1.5.3`), so Sentry releases looked identical even though deploy workflows already set different `environment` values. Distinct beta prerelease versions make regressions and deploys easy to filter in Sentry.

## Promote beta → main

1. Merge feature work into `beta` and bump the beta prerelease as needed (`1.6.0-beta.2`, …).
2. Run **Promote Beta to Main** (GitHub Actions → `promote-beta-to-main.yml`) with confirm `yes`.
3. The workflow merges `beta` into `main`, strips the `-beta` prerelease from `package.json` on `main`, commits, and pushes.
4. The push to `main` triggers **Deploy Production to VPS**.

## Feature development

- Branch from `beta`.
- Open PRs into `beta` (not `main`).
- The PR porting workflow copies merged beta changes to open `feature/*` branches.

## Optional follow-ups

- Automate beta prerelease bumps on merge (workflow that increments `1.6.0-beta.N`).
- Add a release PR template that only updates version/changelog for a final human review before promote.
