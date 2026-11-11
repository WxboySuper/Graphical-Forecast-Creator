# 9. Decisions, open questions, and risks

Why things are the way they are, so you can change them on purpose. This is a living page; add a row when you make a new decision.

## Decisions already made

| Decision | Why | Revisit if |
|----------|-----|-----------|
| Core features are always free; premium only where operating the feature costs money | Mission: GFC is a learning tool | A core feature starts costing real money |
| Open source, MIT | Owner can't maintain alone; learners can fork | Abuse or licensing issue |
| Everything works with no account or server | Low barrier; resilient | Never, without a strong reason |
| `main` is next-major; `stable/X.x` is production; beta is a prerelease, not a branch | Lets big work continue while production stays frozen and hotfixable | Release pain grows |
| Nothing deploys on merge | Deploys are owner-initiated | You want continuous deploy |
| Features hidden by a registry per environment, fail closed | Ship unfinished work safely; server can be killed instantly | Registry becomes too heavy |
| Stripe is the source of truth for premium | One billing authority; webhooks update Firestore | Moving billing provider |
| Cloud payload stored in a separate Firestore doc | Cheap listing; bounded cost | Payload limits change |
| Custom layers carry a snapshot of their style | Old maps never change when a product is edited or a subscription ends | - |
| Verification state is separate from the forecast | Reviewing old forecasts can't damage current work | - |
| Weather data fetched straight from NOAA in the browser | No proxy to run or pay for | Rate limits or CORS problems |
| Self-hosted Umami, Sentry without PII/replay | Privacy-first telemetry | Legal review |
| Cloudflare Worker deployed only via GitHub Actions | One audited deploy path | - |
| Maintenance bots (OpenCode) get no GitHub token; humans merge everything | Limits blast radius of an AI mistake | Trust grows |
| Structure changes are gradual, behaviour-preserving PRs | Avoid a risky big-bang refactor | - |
| Changelog is for users; GitHub Release notes are for traceability | Two audiences | - |

## Open questions

| Question | Context |
|----------|---------|
| Turn on GitHub branch protection / required checks? | Currently off, so merges rely on habit ([page 7](07-working-with-agents.md)) |
| Which hostname is canonical for beta? | Config says `beta.gfcweather.com`; old text says `beta-gfc.weatherboysuper.com`; the marketing mock uses `app.gfcweather.com`. Is a domain move planned? |
| What ships in v2? | 6 open issues in the `v2` milestone (128 closed). Direction: independent forecast workspaces, explicit persistence ownership. |
| Tropical workspace and collaboration room | Gated off. Each needs its own product decision and exposure key before work starts. |
| WarnGen, historical replay, WxSim game | Ideas only (`Future Features` milestone, 10 issues). No contract exists. |
| Which components move first when restructuring? | See "soft spots" in [architecture](02-architecture.md) |

## Risks and debt

| Risk | Severity | Mitigation today |
|------|----------|------------------|
| Single maintainer; agents write the code | Medium | Docs, CI, focused PRs, human merge |
| No branch protection | Medium | Check CI before merging; consider enabling |
| Large `src/components` folder blurs ownership | Low-Med | Gradual feature-API plan |
| Upstream weather services change or rate-limit | Medium | Adapters normalise data; failures are shown, not crashed on |
| Firestore TTL not set in a project | Low | One-time chore ([hosting page](03-hosting-and-services.md)) |
| Docs drift (this repo already had stale hostnames, pnpm version, labels) | Medium | Docs are verified by a link checker; facts were re-verified when this page was written |
| Secrets sprawl across GitHub, Worker, VPS `.env` | Medium | Names catalogued in agent release ops; never committed |
| Bot-generated issues pile up | Low | Per-job caps (3-12 per run); turn jobs off if noisy |

## Glossary of project jargon you'll see in PRs and issues

| Term | Meaning |
|------|---------|
| Lane | Section of the changelog a PR adds to |
| Forward-port | Copy of a stable hotfix onto `main` |
| Capability | A server-side feature switch reported by `/api/capabilities/status` |
| Exposure | Which environments can see a feature |
| Ingestion | Server loop that fetches and caches Auto-TSTM guidance |
| Slot | One of 20 fixed Firestore spots for saved custom products |
| Workspace | A sub-area of Forecast (e.g. severe, tropical) with its own route and state |
| Audit issue | Bot-created issue with the `opencode-audit` label |
