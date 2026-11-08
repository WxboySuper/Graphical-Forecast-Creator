# Workflow rules

## Tooling

- Package manager: **pnpm only**. Never `npm`/`yarn` for dependencies (the `server/` tests run via `npm test --prefix server`, which is the exception).
- Node `22.22.0+`, `24.11.0+`, or `26.x`; pnpm 10 (`packageManager` in `package.json` is authoritative).
- Stack: React (function components + TS), Redux Toolkit (`src/store`), Tailwind v4 (compat config `tailwind.compat.config.js`, generated CSS committed), OpenLayers, Vite, Jest, Playwright.
- Before writing logic: check `package.json`, existing hooks, and `src/utils` / `src/lib`.

## Validation commands

| Need | Command |
|------|---------|
| Dev server | `pnpm run dev` (+ `pnpm run css:watch` for new Tailwind utilities) |
| Typecheck | `pnpm run typecheck` (also `typecheck:tooling`, `typecheck:test`, `typecheck:e2e`) |
| Lint | `pnpm run lint` |
| Unit/component | `pnpm test --runInBand <path>` |
| Script tests | `pnpm run test:scripts` |
| Server tests | `npm test --prefix server` |
| E2E | `pnpm run test:e2e` |
| Exposure | `pnpm test:exposure`, `pnpm validate:feature-exposure` |
| Firestore rules | `pnpm run test:firestore-rules` |
| Build | `pnpm run build` |
| Security | `pnpm audit` |

Actually exercise user-visible changes (browser/Playwright), not just static tests.

## Local beta mode

- `VITE_BUILD_TARGET=beta pnpm run dev -- --port 3002` (PowerShell: `$env:VITE_BUILD_TARGET='beta'; pnpm run dev -- --port 3002`). Beta is open to everyone; the target only adds the banner and feedback button.
- On localhost, `/?localBetaBypass=1` skips the Terms and Privacy modals (E2E uses it). Feedback needs the Worker in `docs/operations/beta-feedback.md`; override with `VITE_FEEDBACK_API_URL`.
- Hosted auth locally needs `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`.
- `VITE_BUILD_TARGET` = `local|beta|staging|production`; defaults to `local`; invalid value fails the build.

## Branching

| Branch | Rule |
|--------|------|
| `main` | Next-major integration; default PR target |
| `stable/X.Y.x` | Production line. Hotfixes start here. Never merge `main` into it. |
| `hotfix/*` | From the current stable line, PR into it |
| `fix/*`, others | Descriptive only; not merge gates |

Forward-ports into `main` are automation-opened draft PRs (`port/<pr>-to-main`); review them, resolve rewrite-specific differences, never auto-merge.

## Commits

Conventional Commits: `feat|fix|chore|docs|style|refactor(scope): message`. Example: `feat(map): add support for high-resolution CWA boundaries`.

## PR requirements

- Fill `.github/PULL_REQUEST_TEMPLATE.md` (exposure checkbox, temporary-feature checkbox, testing).
- Exactly one `Changelog-Impact:` line, enforced by CI:

| Value | Required companion |
|-------|--------------------|
| `beta` | Entry in `CHANGELOG.md` under `### Next major / beta` (the check diffs that lane) |
| `hotfix` | Entry under `### Stable X.Y.x hotfixes` |
| `none` | `Changelog-Reason:` |
| `inherited` | `Port of #<n>`; no second entry |

- Changelog sections: Added, Changed, Deprecated, Removed, Fixed, Security, Dependencies. Write for users, not maintainers.
- Eligible same-repo PRs with `beta`/`hotfix` and no changelog edit get a bot-drafted entry pushed to the branch. Pull before pushing again.
- Last lines of every PR body you author: `Authored by: <exact model ID> via <harness>` then the `Generated with Claude Code` footer (see user-level instructions).
- Schema/API/store-slice changes: document why and how to migrate in the relevant doc under `docs/`. Update `ROADMAP.md` only when a milestone is reached.

## Scope discipline

- Issue-driven PR: change only what that issue needs plus focused regression tests. File a separate issue for adjacent features, UI polish, broad refactors, hardening, and link it in the review response. Exception: when the fix cannot be correct without it.
- Push back on architecture you think is wrong. Product value and users come first.
- If a rule seems off, ask the owner rather than inventing a rule.

## Handoff

Summarise what changed and which docs/changelog were updated. Remind the owner to review before merge.
