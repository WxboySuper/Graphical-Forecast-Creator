# Codebase map

## Repo top level

| Path | Contents |
|------|----------|
| `src/` | React app (see below) |
| `server/` | Express API (own `package.json`). Entry `analytics.js` -> `analytics-app.js` |
| `e2e/` | Playwright specs |
| `tests/` | Firestore rules tests |
| `scripts/`, `scripts/lib/` | CI, release, changelog, exposure tooling. Logic in `lib/`, entry points thin |
| `deploy/` | `*-deployment-config.json` (server capability switches), `production-release.json`, umami |
| `cloudflare/` | Beta Worker (`beta-worker.mjs`, `wrangler.beta.jsonc`) |
| `.github/workflows/` | CI, release, deploy, OpenCode automation |
| `design/marketing/` | Marketing page designs (not app code) |
| `public/` | Static assets, `alert-banner.json` |
| `docs/` | `guide/` (human), `agents/` (you), reference docs, `personal/` (ignored) |

## Surfaces -> entry points

| Surface | Entry | Support |
|---------|-------|---------|
| Forecast | `src/pages/ForecastPage.tsx` | `components/ForecastWorkspace`, `Map`, `DrawingTools`, `store`, `utils` |
| Discussion | `src/pages/DiscussionPage.tsx` | `components/DiscussionEditor`, `pages/useDiscussion*` |
| Monitor | `src/pages/MonitorPage.tsx` | `src/monitor`, `src/monitor/components` |
| Verification | `src/pages/VerificationPage.tsx` | `components/Verification`, `utils`, `store` |
| Account/billing | `src/pages/AccountPage.tsx` | `src/auth`, `src/billing`, `server/account-lifecycle.js`, `server/billing.js` |

## Frontend boundaries

Flow: `index.tsx` -> `App.tsx` (providers, routes) -> `pages` -> `components` -> `hooks` / `store` / `utils` -> `types`. `config`+`features` gate surfaces before render.

| Folder | Owns | Keep out |
|--------|------|----------|
| `pages` | route composition | domain algorithms, big presentational primitives |
| `components` | feature UI, `ui` primitives | hidden global state, route registration |
| `hooks` | React workflows | routes, server logic |
| `store` | slices, selectors, pure reducers | network calls |
| `utils`, `lib` | pure transforms, persistence, geometry, export, validation | React rendering |
| `monitor` | data contracts, upstream adapters, layer sync (UI in `monitor/components`) | generic UI |
| `config`, `features` | build target, exposure, nav metadata, capability gates | unrelated product logic |
| `auth`, `billing` | hosted identity/entitlement clients | forecast state |
| `types`, `maps` | shared contracts, map adapter interfaces | feature code |

Do not create a catch-all `shared/` folder. Reverse imports exist; do not add new ones casually.

## Server boundaries

| Path | Owns |
|------|------|
| `server/*.js` | routes, services, colocated tests |
| `server/lib` | capability, release, deployment-target, emergency-disable helpers |
| `server/release` | VPS rollout/promote scripts |
| `server/weather` | Auto-TSTM generation |
| `server/testing` | fixtures, exposure harnesses |

Rules: validate input at the route; secrets stay server-side; **fail closed** on capability checks; colocate tests.

## Data and state

- Client: Redux + localStorage (autosave every 5 s). Verification state is isolated from the forecast.
- Hosted: Firebase Auth + Firestore. `cloudCycles/{id}` = metadata; payload in `cloudCycles/{id}/payload/payload`. Server derives `payloadBytes`. Rules in `firestore.rules`.
- Stripe is the entitlement truth; server validates webhooks.
- Local build must stay useful with no hosted credentials; hosted-only features are visibly gated AND server-checked.

## Moving code

Target order: feature APIs (Forecast/Monitor/Verification/Discussion) -> move feature code behind them -> hosted client/server separation. Each move is a behaviour-preserving PR with tests and compat exports. Update docs/READMEs in the same PR as any path change.

## Conventions

- Add colocated `README.md` updates when a folder's role changes (they are indexed from `docs/README.md`; a script test checks those links).
- Generated inventory: `pnpm run docs:inventory`; local site: `pnpm run docs:site` (outputs to ignored `docs/personal`).
