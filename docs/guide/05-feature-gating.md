# 5. Feature flags

GFC hides unfinished work and can switch risky features off without branching the code. Everything lives in one file, `server/flags.json`, which the app and the server both read. `pnpm flags` lists every flag and manages its lifecycle.

## Two kinds of flag

| Kind | What it is for | Rules |
|------|----------------|-------|
| `dev` | Hiding unfinished work from production | Off by default, has a `removeBy` version, is deleted once the feature ships |
| `switch` | A kill switch for something that is already live | On by default, has an owner and a one-line runbook, stays for good |

A flag has a value per target (`local`, `beta`, `staging`, `production`). Anything not written for a target gets the flag's default, so **production is on only when the file says so**. Turning a feature on in production is a one-line change in a reviewed PR.

```json
"mesoscaleWorkspace": { "kind": "dev", "owner": "WxboySuper", "issue": 919, "removeBy": "2.x", "default": false, "values": { "local": true, "beta": true } }
```

That line reads: off by default, enabled for local and beta, and due for removal or promotion by the end of v2.

## The lifecycle commands

| Command | What it does |
|---------|--------------|
| `pnpm flags` | Lists every flag with its kind, owner, values per target, `removeBy`, how many places in the code use it, and any emergency override |
| `pnpm flags add <name>` | Adds a new dev flag, off except on your machine |
| `pnpm flags keep <name>` | Turns a shipped dev flag into a permanent kill switch. Needs `--owner` and `--runbook`, and refuses while the flag is still off somewhere |
| `pnpm flags retire <name>` | Deletes a flag and lists the code that still mentions it |
| `pnpm flags check` | Validates the file. CI runs it; it fails only if a dev flag is past its `removeBy` |

## What gating covers

| Piece | Behaviour when the flag is off |
|-------|---------------------------------|
| Routes and navbar items | Not registered, not shown |
| Lazy-loaded code | Never loaded |
| Timers, subscriptions, fetches | Never started |
| Server routes | Return `404` with no work done |

Everything fails closed: an unknown target or a missing value reads as off.

## Server-backed features and the emergency switch

A flag with a `capability` (today only Auto-TSTM) is live only if the file says on, **and** the server's deployment setting allows it, **and** nobody has disabled it in an emergency. To turn one off without rebuilding:

1. SSH to the API host and edit its `.env`.
2. Set `EMERGENCY_DISABLED_CAPABILITIES=TSTM_GENERATION_ENABLED` (comma-separated for several).
3. To also stop background ingestion: `TSTM_INGESTION_ENABLED=false`.
4. Restart with pm2 (for beta: `pm2 restart gfc-beta-analytics`).
5. Check `/api/capabilities/status`; the capability should show `emergency_disabled`.

It can only disable, never enable. Full runbook: [`emergency-feature-disable.md`](../operations/emergency-feature-disable.md). The public status endpoint returns only `{ capabilities: { KEY: { available, reason } } }`; schema in [`public-status-schema.md`](../public-status-schema.md).

## Auto-TSTM at a glance

- Read-only cached routes: `GET /api/tstm/latest`, `GET /api/tstm/status` (120 req/min/client).
- Users can never trigger generation. A scheduled ingestion loop on the server does that.
- Health check: `GET /api/tstm/status` shows whether ingestion is on and whether the Day 1/Day 2 caches are fresh.
- Details: [`auto-tstm-operations.md`](../operations/auto-tstm-operations.md).

## Adding a flag (for agents and humans)

One registry line, the guarded code, and at most one test for the feature's own behavior. The per-target checks are generated from the file. Checklist: [`docs/agents/feature-exposure.md`](../agents/feature-exposure.md).
