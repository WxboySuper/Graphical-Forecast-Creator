# CI and gotchas

## CI jobs (`.github/workflows/ci.yml`, "Checks | CI")

| Job | Runs | Reproduce locally |
|-----|------|-------------------|
| `pr-governance` | branch policy, changelog policy, stable release-line and hotfix policy | `node scripts/check-changelog-pr.mjs` (needs PR env), `validate-branch-policy.mjs` |
| `package-version-policy` | script tests; package version valid for target branch | `pnpm run test:scripts` |
| `typecheck` | app, tooling, test-type regression baseline, e2e | `pnpm run typecheck`, `typecheck:tooling`, `typecheck:test`, `typecheck:e2e` |
| `lint` | ESLint | `pnpm run lint` |
| `feature-exposure-policy` | static exposure registry validation | `pnpm validate:feature-exposure` |
| `firestore-rules` | hostile-client rules tests (needs Java emulator) | `pnpm run test:firestore-rules` |
| `license-policy` | third-party license check | `node scripts/check-third-party-licenses.mjs` |
| `dependency-maintenance` | `pnpm audit` root + server | `pnpm audit` |
| `build-and-test` | geo asset integrity, Tailwind snapshot freshness, build, bundle budget, Jest coverage, US-timezone toolbar test, server tests | see below |
| weather tests | Python unittest for Auto-TSTM | `python -m unittest discover -s server/weather -p 'test_*.py'` |
| e2e | Playwright | `pnpm run test:e2e` |

Other automation (OpenCode, Todoist, release): [release-ops](release-ops.md), [opencode-maintenance](../operations/opencode-maintenance.md).

## Gotchas

- **pnpm version**: `package.json` pins `pnpm@10.30.3` (`packageManager`). Older text saying pnpm 9 is wrong. The `server/` package is separate and uses npm (`server/package-lock.json`).
- **Generated Tailwind CSS is committed**: `src/tailwind.generated.css` comes from `pnpm run css:build` (runs as `prebuild`). CI fails if it is stale. After adding utility classes, run `pnpm run css:build` and commit the result.
- **TypeScript**: `typescript` is the TS6 compatibility package for `typescript-eslint`; `@typescript/native` (TS 7) provides the fast `tsc`. Use the pnpm scripts, not a global `tsc`.
- **Test type-check baseline**: `scripts/test-type-errors-baseline.json` records tolerated test type errors; do not add new ones, and lower the baseline when you fix some.
- **Geo assets**: vendored boundary datasets are integrity-checked (`scripts/validate-geo-assets.mjs`); see [geo-boundary-datasets](../geo-boundary-datasets.md).
- **Mesoscale ingest**: Python dependencies are pinned in `scripts/mesoscale/requirements.txt`; install them before running `python -m unittest discover -s scripts/mesoscale -p 'test_*.py'`. GitHub Actions uses Ubuntu system ecCodes with JPEG support for RAP GRIB decoding; a local ecCodes wheel may lack JPEG. The scheduled workflow stays disabled until `MESOSCALE_INGEST_ENABLED=true` is set as a repository variable and the documented R2 secrets exist. See [catalog contract](../architecture/mesoscale-catalog-contract.md) and [ingest operations](../architecture/mesoscale-ingest-operations.md).
- **Timezones**: discussion/toolbar dates are wall-clock sensitive; run `pnpm run test:toolbar:timezone` when touching them ([discussion times](../architecture/discussion-wall-clock-times.md)).
- **No branch protection** on `main` (see [reference](reference.md#github)). Check CI yourself before declaring done.
- **Bot commits**: changelog drafter and Dependabot automation push to PR branches. `git pull --rebase` before pushing again.
- **Dependabot entries** in `CHANGELOG.md` sit under a `<!-- dependabot-automation -->` marker; do not hand-edit inside it.
- **Hostnames**: beta is `beta.gfcweather.com`; some old comments say `beta-gfc.weatherboysuper.com`.
- **Never run** release, deploy, or secret-touching workflows unless asked; they act on real infrastructure.
- **Unused/odd labels and the Leaflet wording** in GitHub label descriptions are stale; the map is OpenLayers (`ol`).
- Local docs checks: `node --test scripts/build-local-docs.test.mjs` verifies every markdown link/anchor in the corpus. Run it after editing docs.
