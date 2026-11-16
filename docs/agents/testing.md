# Testing and code-documentation rules

## Where tests live

| Kind | Location | Runner |
|------|----------|--------|
| Unit/component | beside the module under `src/` | Jest + Testing Library |
| Server | beside the route/service under `server/` | `npm test --prefix server` (finds nested suites) |
| Scripts | beside script in `scripts/`, `scripts/lib/` | `pnpm run test:scripts` |
| Browser workflows | `e2e/*.spec.ts` | Playwright (`pnpm run test:e2e`) |
| Firestore rules | `tests/firestore.rules.test.mjs` | `pnpm run test:firestore-rules` (emulator) |
| Feature exposure | `*.exposure.test.ts(x)`, `server/testing/` | `pnpm test:exposure` |

## Rules

- Test user-visible behaviour and security boundaries, not implementation shape.
- Keep behaviour groups together; split a file when unrelated concerns make failures hard to locate.
- Remove a test only with evidence its behaviour is covered elsewhere. Never swap workflow coverage for implementation-shaped assertions.
- Focused run first: `pnpm test --runInBand <path>`. Use the full CI matrix before calling a cross-cutting change done.
- Timezone-sensitive toolbar test: `pnpm run test:toolbar:timezone`.
- Coverage exclusions in `jest.config.js` need an owner and justification in [`coverage-exclusions.md`](../coverage-exclusions.md); update both together.
- Type-checks for tests: `pnpm run typecheck:test`; e2e: `typecheck:e2e`.

## Feature-exposure tests

Every gated feature needs either a contract test or an entry in `src/config/featureExposure.acknowledgements.json` (non-empty `reason`, positive `trackingIssue`). See [feature-exposure.md](feature-exposure.md).

## When to write code comments

Comment only when a reader cannot infer the contract from names and types. Do not add symbol-name comments to satisfy a linter or audit.

Worth documenting:

- **Persistence helpers**: the fallback applied to malformed stored data (nothing malformed may reach Redux).
- **Monitor adapters**: the source format and normalisation boundary (timestamps, alert payloads, map metadata).
- **Geometry/verification utils**: pure; no input mutation, deterministic ordering, explicit handling of empty/invalid geometry.
- **Hooks**: what is started, what is cleaned up (timers, subscriptions, in-flight requests), which state transition is coordinated.
- **Selectors**: fallback when a day is absent; whether they return active day, requested day, or whole forecast.
- **Custom-layer utils**: preserve ordering, normalise persisted values, immutable reducer updates.
- **Test harness helpers**: the observable condition they establish.

Test fixtures are not held to doc-comment rules; comment only a non-obvious setup invariant.
