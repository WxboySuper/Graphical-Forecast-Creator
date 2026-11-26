# OpenCode maintenance

Repository workflows use OpenCode for issue triage, owner-requested tasks,
reviews, and changelog work. GitHub Actions supplies repository context and
publishes results. The review and new-issue triage actions use separate
publisher steps for GitHub writes. The daily bug hunt, security and dependency
inspections, weekly and monthly audits, and audit issue worker are scheduled outside this repository.
Their schedules are maintained by the external scheduler, not by files in
`.github/workflows`.

## Workflow triggers

| Workflow | Trigger | Work |
| --- | --- | --- |
| `ocr-review.yml` | `pull_request_target`: `opened`, `ready_for_review`, `synchronize`, `reopened`, `edited`. A trusted collaborator can request a review with an issue comment starting `/ocr`. | Reviews eligible same-repository PRs and posts or updates the review summary. Automatic reviews skip draft PRs, HOLD/WIP titles, and fork heads. |
| `opencode.yml` | Created issue comments or PR review comments starting `/oc` or `/opencode`, posted by `WxboySuper`. | Runs an owner-requested OpenCode task or issue triage. |
| `opencode-issue-triage.yml` | `issues.opened`; bot-authored issues are skipped. | Adds a code-backed observation or a focused question when useful. |
| `opencode-changelog-pr.yml` | `pull_request_target`: `opened`, `reopened`, `ready_for_review`. | Prepares changelog metadata for same-repository Dependabot PRs and drafts entries for eligible same-repository PRs. |
| `opencode-changelog-audit.yml` | Fridays at 15:17 UTC, manual dispatch, or `workflow_call` from `release-stable.yml`. | Checks the selected release line and opens a correction PR when needed. |

The daily bug hunt, security and dependency inspections, weekly and monthly
audits, and audit issue worker have no trigger in this repository's workflows.
Their schedules are maintained outside the repository. Change those
cadences in the external scheduler that owns them.

Each model workspace uses Git sparse checkout to omit every tracked `.env` or
`.env.*` file except `.env.example`. This applies to review, triage, scheduled,
research, and implementation runs. Bug hunts combine those exclusions with the
selected source-area scope. OpenCode's grep permission is pattern-based rather
than matched-file-based, so these files are removed from its searchable
worktree instead of relying on grep permission rules to filter results.

The daily bug hunt rotates through `src/monitor`, `src/forecast`,
`src/verification`, `src/components`, `src/utils`, `server`, `scripts`, and
`src/billing`. Git sparse checkout exposes only the selected source area plus
root project files to that model run. The publisher also rejects bug-hunt
findings outside the selected area. The daily security worker rotates through
security themes such as authorization, credential handling, validation, trust
boundaries, API behavior, and dependency reachability. It never implements a
security finding.

The weekly audit rotates through bugs, architecture, incomplete work, dead
paths, error handling, verification, documentation, API correctness, and
reliability. The monthly audit covers broader cross-cutting concerns. These
audits can create several reported issues in one run. Neither audit implements
its findings. The Monday dependency review runs in the evening after
Dependabot's Monday activity. It reads current alerts and open Dependabot PR
context, but never upgrades or merges a dependency.

## External audit issue lifecycle

External audit jobs create issues with the `opencode-audit` label and a hidden
machine marker containing a fingerprint, category, issue kind, file, and
permitted scope. The workflow adds `opencode-audit-eligible` only for lower-risk
bug, documentation, test, and maintainability findings in approved repository
areas. Security, dependency, authorization, billing, deployment, and other
sensitive findings require a human-led fix.

The worker ignores ordinary issues, including issues that copy the audit
marker. An issue must be open, authored by `github-actions[bot]`, contain the
exact audit marker, and carry both labels added by the audit publisher. This
keeps public issue text from becoming implementation instructions.

## External implementation worker

The worker selects the oldest eligible issue and claims it with a label and a
hidden state comment. A repository-wide concurrency group allows only one
worker run at a time. A claim younger than 90 minutes blocks another run. A
stale claim can be reclaimed after the worker timeout. Setup or model failures
release the claim and wait six hours before retry. A failed validation or an
unclear, risky, or out-of-scope issue gets `opencode-audit-needs-human` and is
removed from the queue. An open implementation PR gets `opencode-audit-pr` and
is removed from the queue.

The worker checks the finding again before editing. OpenCode can read the
repository, but its edit permission allows changes only under the issue's
machine-recorded directory. It has no shell, GitHub token, subagent, web,
release, or deployment tools. It cannot commit or push. OpenCode sees the
sanitized source checkout before dependencies are installed. After it exits,
the workflow installs dependencies and a separate step checks the staged diff,
runs related Jest tests, runs ESLint for source changes, runs TypeScript
checking for TypeScript changes, and builds the application for `src/` changes.
That validation step does not receive the model key or GitHub token.
Validation also routes deletions, renames, symlinks, more than eight changed
files, or a staged diff larger than 32 KiB to `opencode-audit-needs-human`.
Those changes never reach the PR publisher.

After validation, the external publisher creates a branch named
`opencode/audit-<issue>-<run>-<attempt>`, pushes only that branch, opens a PR
referencing the audit issue. Opening the PR triggers the current review workflow.
The publisher's token can push that branch, create a PR, and update issue labels.
The OpenCode process never sees that token. The publisher has no merge, release,
deployment, or repository settings code path. Existing branch protection and
required human review remain the merge boundary. The publisher never merges a PR.

## PR review and issue triage

The automatic review runs from `ocr-review.yml` on PR open, ready-for-review,
push, reopen, and edit events. It reports its required check on each PR head;
draft PRs, HOLD/WIP titles, and fork heads skip the review itself. A non-bot
owner, member, or collaborator can request a review by commenting with `/ocr`
on the PR. The workflow posts inline findings, a sticky review summary, and a
separate OCR digest comment. The sticky summary and digest each update on later
reviews. The digest records the review scope, findings, cost, and full run link.
The required `ocr-review` check fails for medium-or-higher findings; low,
style, and nit findings are suppressed. The workflow does not resolve inline
review threads.

`opencode.yml` handles owner-requested `/oc` and `/opencode` comments on issues
and PR review threads. `opencode-issue-triage.yml` separately handles newly
opened non-bot issues. Triage can add a code-backed observation or a focused
question; it leaves no visible comment when it has nothing useful to add.

## State, deduplication, and failure handling

External scheduled jobs share one state issue titled `[Maintenance state] OpenCode job
history`. A hidden bot comment stores the last successful period, last scope
and focus, inspected commit, finding count, stable reported fingerprints, and
last attempt status. The scheduled workflow serializes state updates.

The state schema calls the schedule key `period` and stores successful runs as
`lastSuccessPeriod`, matching the workflow caller. Existing `lastSuccessKey`
values are migrated when the state comment is read. The state comment is updated first. The same full state is then written back
to `STATE_PATH` before an inconclusive result marks its step failed. Failure
cleanup changes only a `started` attempt to `failed`, so it cannot overwrite a
published `inconclusive` or `complete` result. Regression tests cover all
three transitions. A run that cannot reach the state issue or Dependabot API
fails visibly rather than recording an empty result.

Audit issues carry stable fingerprints, and the worker state comment records
`claimed`, `failed`, `needs-human`, or `pr-open`. Existing open PRs are checked
before claiming an issue. PR review comments include the head SHA and review
type. Issue triage uses one marker per issue. These markers keep retries and
multiple triggers from creating duplicate work or comments.

## Permissions and human control

| Workflow | GitHub permissions |
| --- | --- |
| OCR review | `contents: read`, `pull-requests: write`, `statuses: write`; review summary is posted as `github-actions[bot]` |
| Issue triage | `contents: read`, `issues: write` |
| Changelog audit | `contents: read`, `issues: write`, `pull-requests: read` |
| PR changelog | `contents: read`, `pull-requests: read` |
| Owner task | `contents: write`, `issues: write`, `pull-requests: write` |
| External scheduled investigations and issue worker | Credentials and permissions are managed by the external scheduler. |

External audit workers keep their GitHub token outside the model process. The
owner task workflow can write to its trusted issue or PR branch as authorized
by its workflow permissions.
GitHub API calls that create issues, update labels, push a worker branch, or open
a PR live in separate publisher steps. No repository workflow
gets deployment or release permissions. No job can change repository settings
or branch protection. Protected branches remain guarded by repository rules;
all merges are human decisions.

PR changelog handling runs in `.github/workflows/opencode-changelog-pr.yml`
on `pull_request_target`. Every same-repository Dependabot PR enters the
trusted preparation job without needing a changelog declaration in its
description. Preparation classifies runtime dependency bumps as beta or
hotfix, and development-tooling-only bumps as none. It updates only the
managed PR description block. The dependent OpenCode job then investigates
every Dependabot PR, including draft PRs, and decides whether an entry is
needed. A no-change result is accepted only for a Dependabot PR declared none.
Runtime dependency changes require a grounded entry or the job fails for
maintainer follow-up. Generated changes go through the same trusted publisher
as collaborator PRs. This workflow listens only for opened, reopened, and
ready-for-review events; it does not rerun on branch pushes or body edits. A
generated `CHANGELOG.md` commit cannot trigger a duplicate changelog run.
Collaborator PRs that declare a beta or hotfix impact also use OpenCode to
draft an entry. The workflow checks out
maintenance scripts from the
repository default branch before it checks out the PR head. The PR checkout is
input data only, with `persist-credentials: false`. The workflow executes no
PR-provided script or local action. It removes tracked `.env` files and
project OpenCode configuration, plugins, and hooks before starting the model.
OpenCode receives the complete PR description, including Dependabot's
upstream release notes, instead of a truncated excerpt. The shared runner
attaches large prompts from a temporary file in the sanitized checkout rather
than passing the prompt as one command-line argument; it removes that file
when the model exits.

Generation requires exactly one eligible changelog declaration and a diff
that does not already change `CHANGELOG.md`. It is bounded to 80
changed files, 90,000 diff characters, four entries, 450 characters per entry,
and a 12-minute model timeout. Fork PRs, other decision values, oversized
diffs, and inconclusive results do not produce automated edits; the changelog
check remains the required gate. Dependabot is accepted only when GitHub
identifies `dependabot[bot]`, the head repository matches GFC, and the branch
starts with `dependabot/`. The trusted automated preparation and publishing
steps use `GH_PAT` for PR metadata updates or authenticated fetch/push. OpenCode has read-only repository tools and
receives only `OPENCODE_API_KEY`. The trusted publisher rechecks the live PR
identity and head, then commits only `CHANGELOG.md`. No checkout credential
is persisted. The ordinary
`pull_request` CI workflow has read-only token permissions, no repository
secrets, and no token environment passed to PR-controlled scripts. Human review
and branch protection remain the merge boundary.

First-look reviews inspect each supplied open review thread against the current
code and tests. An open GitHub thread does not by itself mean the code concern
is unresolved. A technically addressed concern may still receive 10/10 while
GitHub awaits a reviewer to resolve the thread. The parser rejects missing or
invalid thread assessments, and it refuses to publish a clean score when the
reviewer says a concern remains open or unclear without reporting a concrete
finding. The workflow paginates through all review threads and comments rather
than sampling the first page. If GitHub cannot return the complete history, the
review job stops before publishing a score.
The flat changelog audit is available as **Maintenance | OpenCode changelog
audit**. Run it manually for `main` or a `stable/X.x` line, or let it run each
Friday to keep the Unreleased lane clean and fill gaps as they appear. The
stable release workflow calls the bounded audit as a required final preflight
before publication. The
preflight forces a fresh inspection of the exact release-line revision. If it
finds a gap, it opens a normal PR containing only `CHANGELOG.md` and blocks the
release. Merge that PR, then rerun the release workflow. Inconclusive results,
failed audits, open correction PRs, and a release line that moves after audit
all stop publication and deployment. A clean result allows the release to
continue. Release notes combine the curated release-lane entries with GitHub
categorized merged-PR notes. The generated Markdown is both the public GitHub
release description and a downloadable `GFC-v<version>-release-notes.md` asset,
so other publishing platforms can reuse the same text.

The audit is bounded to 60 commits, 80 changed files, a 90,000-character code
diff, four entries, and a 15-minute model run. It excludes environment and key
files from model context, and an oversized or inconclusive run publishes no PR.
The existing hidden maintenance-state comment stores each target line's last
inspected commit and any pending audit PR. `force` bypasses the same-head skip,
but a zero-commit range still ends before OpenCode starts. Use `baseline_ref` to
choose a different bounded range. Otherwise successful revisions and pending
PRs are deduplicated. OpenCode remains read-only and token-free. Deterministic code validates the
entries, writes only to a generated branch, and opens a human-reviewed PR. The
reusable preflight gets `contents: read`, `issues: write`, and
`pull-requests: read`; `GH_PAT` is isolated to its deterministic publisher and
can push the generated branch and open the correction PR. No autonomous audit
merges, releases, or deploys.

Manual runs also accept an optional `baseline_ref`, which must be a full commit
SHA or an ancestor version tag for the selected release line. `main` accepts
beta tags; `stable/X.x` accepts padded stable semver tags from that same line.
This prevents a baseline from another release line from widening the audit.
It overrides the saved/tag baseline for that run only; a clean result records the
audited head as the next normal baseline. Leave it blank for ordinary runs.
Use it to bound a deliberate backfill or the first audit after a large manual
changelog cleanup. The target remains the current branch head, and the
publisher still refuses to open a PR if that branch moves during the audit.

## Compute and output limits

The owner task, issue triage, PR changelog, and changelog audit workflows share
the Actions concurrency group `gfc-opencode-maintenance-queue`. GitHub queues up
to 100 pending runs for that group; runs beyond the limit are canceled. Queue
order follows arrival time, not event time. OCR review uses separate per-PR
concurrency groups in `ocr-review.yml`. External scheduled jobs do not use this
Actions queue unless their scheduler explicitly dispatches a repository
workflow. Their model limits and finding caps are configured outside this repo.

## PR review format

`ocr-review.yml` runs on PR open, ready-for-review, push, reopen, and edit
events. Its required check reports on each PR head, including when the workflow
skips a draft, HOLD/WIP title, or fork head. Trusted collaborators can request
another review with an `/ocr` issue comment. The owner-requested OpenCode task
workflow is separate and responds to `/oc` or `/opencode` comments from
`WxboySuper`.

The reviewer publishes one bot-owned issue comment and updates it on later
revisions and manual requests. It does not create a separate pull-request
review object for each run. Earlier review objects from before this format
remain in the PR history; the workflow does not delete them.

The publisher validates the model's bounded JSON result and renders a stable,
compact format: a full **PR Summary** on every pass; on later passes, **Changes
since previous review** for commits since the saved head; **Good things**;
**Bad things**; and **Rating**. It also reports prior findings as resolved,
still open, or unclear, and assesses supplied GitHub review threads. The linked
issue section appears only for GitHub-linked closing issues. Review-thread
status appears when the sampled history has open or resolved threads. Findings
include P0 to P3 severity, a changed-file location, evidence, and impact. The
bot never resolves review threads itself. Linked issues, review comments, and
PR text are untrusted model context.
If a follow-up omits or malforms a prior-finding assessment, the publisher marks
that item unclear and carries it forward; incomplete assessment output does not
discard the review or silently resolve an earlier finding.

Follow-up runs compare the current PR head with the head recorded in the bot
comment, include all commit subjects and all patches returned by GitHub, and
give the reviewer prior structured findings for explicit resolution status.
The workflow no longer clips patches at small per-file or total-size limits;
OpenCode's model context and compaction handle large reviews. GitHub's own API
response ceilings or omitted binary/oversized patches are reported in a separate
**Review coverage** section, never as a code finding. A failed commit comparison
is distinguished from a prior review that had no recorded head.

The OCR workflow token has `contents: read`, `pull-requests: write`, and
`statuses: write` permissions. The review action receives the model API key;
separate workflow steps publish its summary and check status. The review cannot
merge, release, deploy, or change repository settings. To request a review from a PR,
comment starting with `/ocr`. To request an owner-run OpenCode task, the owner
can comment with `/oc` or `/opencode`.

## Turning jobs off

Disable an in-repository workflow from its entry in the repository's Actions
settings:

- Automated and `/ocr` reviews: `ocr-review.yml`
- `/oc` and `/opencode` tasks: `opencode.yml`
- New-issue triage: `opencode-issue-triage.yml`
- PR changelog preparation: `opencode-changelog-pr.yml`
- Weekly/manual changelog audit and stable-release preflight: `opencode-changelog-audit.yml`

The daily bug hunt, security and dependency inspections, weekly/monthly audits,
and audit issue worker are scheduled outside the repository. Their scheduler
account and location are not documented here. WxboySuper, the project owner,
maintains those jobs; ask the owner to stop or change their schedules. There
are no corresponding workflow files to turn off in Actions.

Model confidence is informational. Scheduled publishers do not discard concrete
findings based on a numeric confidence cutoff. Audit issues are reports for
investigation, not proof of a defect. The implementation worker rechecks eligible
findings before editing; security and dependency findings remain human-only.
