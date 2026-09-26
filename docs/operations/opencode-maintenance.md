# OpenCode maintenance jobs

GFC keeps its comment-driven OpenCode workflow in
`.github/workflows/opencode.yml`. The automatic jobs use the same OpenCode CLI
and model secret through `scripts/run-opencode-maintenance.mjs`. GitHub API
context and publishing stay in workflow steps. The model process receives no
GitHub token and cannot edit the checkout or run shell commands.

## Jobs

| Job | Trigger | Output |
| --- | --- | --- |
| PR first-look review | Eligible PR opened, updated, reopened, or marked ready | One PR conversation comment per head SHA |
| Issue triage | Issue opened | A technical comment or a focused request for missing details; no comment when there is nothing useful to add |
| Bug hunt | Every Monday | At most two high-confidence, evidence-backed issues from one rotating code area |
| Dependency and security review | First day of each month | At most two issues for alerts that affect code GFC uses; no automatic upgrades |
| Docs and changelog check | As part of each PR first-look review | Specific documentation or changelog gaps in the review comment |
| Bounded research | Explicit `workflow_dispatch` request | Read-only findings in the workflow run summary |

The scheduled bug hunt rotates through `src/monitor`, `src/forecast`,
`src/verification`, `server`, `scripts`, and `src/billing`. The dependency job
reads open Dependabot alerts and checks the affected dependency against GFC's
manifests and code. If the Dependabot API is unavailable, the run fails rather
than reporting that no vulnerabilities exist. Research requests are limited to
4,000 characters, and an optional scope field is limited to 1,000 characters.

## PR review safety

The PR workflow uses `pull_request_target` so its comment permission is not
downgraded by pull request token policy. It only runs for non-draft PRs from
the same repository when the author association is owner, member, or
collaborator. Fork PRs do not receive the model API key.

The workflow checks out the trusted default branch, not the PR branch. It gets
the PR metadata, diff patches, and check results through the GitHub API. It
includes no more than 30 changed files and 2,000 patch characters per file. If
that limit truncates the diff, the prompt asks OpenCode to state that limit.
The job has a 20-minute timeout.

The token grants `contents: read`, `pull-requests: read`, `checks: read`, and
`issues: write`. `issues: write` lets the workflow post a PR conversation
comment. It has no `contents: write` or `pull-requests: write`, so it cannot
push or merge. The model only gets `read`, `glob`, and `grep` tools inside the
checkout. Every other OpenCode tool is denied, including shell, edit, write,
web, and subagent tools. Reads outside the repository are denied, and `.env`
files stay blocked. The job has no ID token or personal access token.

The PR diff and text are untrusted data. The workflow never checks out or runs
PR code. The OpenCode process cannot call GitHub APIs; a separate workflow step
posts its text result after checking that the PR head has not changed.

## Issue triage

Triage runs once for a new non-bot issue. It reads the trusted default branch and gives
the issue text to OpenCode as untrusted data. It can add code-backed context or
ask a focused reproduction question. It cannot assign labels or edit files.
When no useful comment is warranted, the workflow posts a hidden deduplication
marker so a rerun does not spend model time on the same issue again.

## Scheduled maintenance and state

Scheduled work has a shared concurrency group so overlapping runs cannot
overwrite each other's state. On its first run, the scheduled workflow creates
one issue titled `[Maintenance state] OpenCode job history`. It stores a small
JSON record in a hidden bot comment on that issue. The record keeps each
category's last successful period, inspected scope, commit SHA, finding count,
and the last attempt status.

The weekly bug hunt advances to the next code area only after a successful
inspection. A failed or inconclusive run records its status but does not mark
the period complete, so a later schedule can retry it. Findings include a
stable fingerprint in the issue body. Before opening an issue, the job checks
existing issues for that fingerprint. It caps output at two findings per run
and reports only findings with a concrete file, line, evidence, and declared
confidence of at least 0.9. The dependency job never upgrades packages.

If the Dependabot alerts endpoint is disabled or unavailable, the workflow
fails and records the attempt. It does not treat an inaccessible alert list as
an empty list. GitHub Actions keeps logs for failed runs; the state comment
stores a short pointer to those logs, not environment values or credentials.

## Cost and configuration

Event jobs run only for new issues or meaningful PR events. Scheduled work runs
weekly or monthly, and the PR head marker, issue marker, scheduled period key,
shared concurrency group, and 15-minute model timeout limit duplicate work.
Each workflow also has an overall timeout. Empty bug-hunt results update state
without opening an issue. Issue triage emits no visible comment when it has
nothing useful to add.

All jobs use the existing `OPENCODE_API_KEY` Actions secret and the model
configured in the workflows. The CLI is pinned to version `1.18.32`; update
that version deliberately after reviewing a release. The API key is
available only to the model-run step. The runner removes GitHub and Actions
tokens from the child process environment.

The scheduled state issue is public because repository issues are public. Do
not store secrets, user data, or long investigation transcripts in it.

## Adding or changing a job

Give a job one trigger, one narrow prompt, an input-size limit, a timeout, and
an explicit completion condition. Add only the token permissions its workflow
steps need. Do not pass the GitHub token into the OpenCode process. For a new
scheduled category, add a category key to the state issue record, a sensible
interval, and a bounded code scope. Deduplicate reports using a stable marker
that can be checked before creating an issue or comment.

Autonomous jobs do not merge, release, deploy, change repository settings,
write branches, or open corrective PRs. A research run returns findings for
the maintainer to use in a separate engineering session. The first-look review
can point out a fix worth proposing in a separate PR, but does not create that
PR itself. The manual comment-driven workflow remains a separate,
user-requested path.
