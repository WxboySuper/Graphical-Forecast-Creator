# OpenCode maintenance

GFC uses the existing OpenCode CLI and `OPENCODE_API_KEY` secret for bounded
maintenance jobs. GitHub Actions supplies repository context and publishes
results. OpenCode does not receive a GitHub token for investigation or review.
The implementation worker can edit a small, eligible area, but it cannot run
commands or publish. A separate workflow step validates and publishes its
change as a PR. A human reviews and merges every PR.

## Job schedule

| Job | Trigger | Work and output |
| --- | --- | --- |
| PR first-look | PR opened, new commits, reopened, ready for review; owner can comment `/review-opencode` | The same queued run waits up to 45 minutes for matching `Checks | CI`, then writes or updates one summary comment. It stops if the PR head changes. |
| Issue triage | A non-bot issue opens | Code-backed context or one focused request for missing information |
| PR changelog draft | Trusted `pull_request_target` activity for an eligible PR | Default-branch tooling drafts a bounded factual entry; the trusted publisher validates and commits it to the PR branch |
| Changelog audit | Manual dispatch, weekly Friday schedule, required beta/stable release preflight | Compare actual changes with the release lane; create a correction PR when needed and block publication until clean |
| Daily bug hunt | Daily at 06:11 UTC | Rotating source area; at most three high-confidence issues |
| Daily security inspection | Daily at 07:23 UTC | Rotating security focus and source area; at most three issues |
| Dependency review | Monday at 23:31 UTC | Open Dependabot alerts, PRs, lockfile changes, and code use; at most five issues |
| Weekly deep audit | Sunday at 06:43 UTC | Rotating maintenance category and code area; at most eight issues |
| Monthly deep audit | First day of the month at 09:19 UTC | Broad rotating audit; at most twelve issues |
| Audit issue worker | Every two hours at minute 17 | Selects one eligible audit issue, rechecks it, validates a bounded fix, and opens a PR |

Scheduled investigations run even when earlier runs found nothing. A complete
empty result advances that job's rotation. Failed and inconclusive results do
not advance it. High investigation frequency is intentional. Finding creation
requires concrete evidence, a valid file and line, an impact description, and a
high confidence score. Existing fingerprints suppress repeat issues.

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
audits can create several verified issues in one run. Neither audit implements
its findings. The Monday dependency review runs in the evening after
Dependabot's Monday activity. It reads current alerts and open Dependabot PR
context, but never upgrades or merges a dependency.

## Audit issue lifecycle

Audit workflows create issues with the `opencode-audit` label and a hidden
machine marker containing a fingerprint, category, issue kind, file, and
permitted scope. The workflow adds `opencode-audit-eligible` only for lower-risk
bug, documentation, test, and maintainability findings in approved repository
areas. Security, dependency, authorization, billing, deployment, and other
sensitive findings require a human-led fix.

The worker ignores ordinary issues, including issues that copy the audit
marker. An issue must be open, authored by `github-actions[bot]`, contain the
exact audit marker, and carry both labels added by the audit publisher. This
keeps public issue text from becoming implementation instructions.

## Implementation worker

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

After validation, a fixed publisher step creates a branch named
`opencode/audit-<issue>-<run>-<attempt>`, pushes only that branch, opens a PR
referencing the audit issue, and dispatches the first-look reviewer. Its token
has the GitHub permissions needed to push that branch, create a PR, update the
issue labels, and dispatch the review workflow. The OpenCode process never sees
that token. The publisher has no merge, release, deployment, or repository
settings code path. Existing branch protection and required human review remain
the merge boundary. The workflow never merges a PR.

## PR review and issue triage

The first-look review uses `pull_request_target` but checks out the trusted
default branch and reads PR content through the GitHub API. It skips forks,
drafts, stale revisions, and untrusted authors. It caps the diff at 30 files
and 2,000 patch characters per file. Its default `GITHUB_TOKEN` can read contents, issues, PRs, and
checks. The publishing step uses the job's `GITHUB_TOKEN` with only
`pull-requests: write`, so GitHub posts the review as `github-actions[bot]`.
The model never receives that token. It can only read, list, and search the
checkout.

The first event review and the CI supplement use separate revision markers, so
completed checks add context without repeating the first comment. GITHUB_TOKEN
does not start normal pull-request workflows when the worker opens a PR, so the
publisher explicitly dispatches the first-look review. Fork PRs never receive
the model key.

Issue triage runs only on newly opened non-bot issues. It can read code and
comment with a specific technical observation or a focused question. If it has
nothing useful to add, it leaves a hidden deduplication marker and no visible
comment. It cannot assign labels or edit files. Audit-generated issues skip
triage, avoiding an automation loop.

## State, deduplication, and failure handling

Scheduled jobs share one state issue titled `[Maintenance state] OpenCode job
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
| PR first-look | `GITHUB_TOKEN`: `contents: read`, `issues: read`, `pull-requests: write`, `checks: read`; review is posted as `github-actions[bot]` |
| Issue triage | `contents: read`, `issues: write` |
| Changelog audit | `contents: read`, `issues: write`, `pull-requests: read` |
| Scheduled investigations | `contents: read`, `issues: write`, `security-events: read`, `vulnerability-alerts: read` |
| Audit issue worker | `contents: write`, `issues: write`, `pull-requests: write`, `actions: write` for the isolated publisher job |

The audit worker's GitHub token is available only to GitHub Actions steps. The
model receives only `OPENCODE_API_KEY`, read access, and scoped file editing.
GitHub API calls that create issues, update labels, push a worker branch, open
a PR, or dispatch first-look review live in separate workflow steps. No job
gets deployment or release permissions. No job can change repository settings
or branch protection. Protected branches remain guarded by repository rules;
all merges are human decisions.

PR changelog generation runs in `.github/workflows/opencode-changelog-pr.yml`
on `pull_request_target`. The workflow checks out maintenance scripts from the
repository default branch before it checks out the PR head. The PR checkout is
input data only, with `persist-credentials: false`. The workflow executes no PR-provided
script or local action. It removes tracked `.env` files and project OpenCode
configuration, plugins, and hooks before starting the model.

Generation requires exactly one `Changelog-Impact: beta` or `hotfix` decision
and a diff that does not already change `CHANGELOG.md`. Same-repository
Dependabot PRs are included: a trusted preparation step classifies whether a
dependency bump affects the product, writes only the changelog decision into
the PR description, and then OpenCode investigates the full PR description,
upstream release notes, dependency diff, and GFC usage. The preparation step
does not write changelog entries. The complete PR description is passed as
model context so Dependabot's release-note details are not truncated.

Generation is bounded to 80 changed files, 90,000 diff characters, four
entries, 450 characters per entry, and a 12-minute model timeout. Fork PRs,
other decision values, oversized diffs, and inconclusive results do not
produce automated edits; the changelog check remains the required gate.
OpenCode has read-only repository tools and receives only
`OPENCODE_API_KEY`. The trusted publisher rechecks the live PR identity and
head, then commits only `CHANGELOG.md`. The preparation job's
`GITHUB_TOKEN` can read contents and edit PR metadata; the publisher uses
`GH_PAT` only for the generated branch update. No checkout credential is
persisted. Large task prompts are attached to the checkout as a temporary file
instead of being passed as a command-line argument, then removed when the
runner exits. The ordinary
`pull_request` CI workflow has read-only token permissions, no repository
secrets, and no token environment passed to PR-controlled scripts. Human review
and branch protection remain the merge boundary.
The flat changelog audit is available as **Maintenance | OpenCode changelog
audit**. Run it manually for `main` or a `stable/X.Y.x` line, or let it run each
Friday to keep the Unreleased lane clean and fill gaps as they appear. Beta and
stable release workflows call the same bounded audit as a required final
preflight before version preparation, release publication, or deployment. The
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
beta tags; `stable/X.Y.x` accepts stable `vX.Y.Z` tags from that same line.
This prevents a baseline from another release line from widening the audit.
It overrides the saved/tag baseline for that run only; a clean result records the
audited head as the next normal baseline. Leave it blank for ordinary runs.
Use it to bound a deliberate backfill or the first audit after a large manual
changelog cleanup. The target remains the current branch head, and the
publisher still refuses to open a PR if that branch moves during the audit.

## Compute and output limits

All workflows that invoke OpenCode share the repository-wide Actions concurrency
group `gfc-opencode-maintenance-queue`. GitHub runs one workflow from that group
at a time and queues up to 100 pending runs across event reviews, triage,
scheduled work, changelog audits, issue implementation, research, and manual
`/opencode` requests. The queue uses `queue: max`; runs beyond GitHub's 100-run
limit are canceled. GitHub orders queued runs by when they enter the queue, so
strict ordering by event time is not guaranteed. Long audits can delay first-look
reviews because all OpenCode runs share this lane. Keep per-job timeouts and
deduplication in place because a queued run can become stale before it starts.

Daily inspections have 15- to 20-minute model limits. Dependency review has a
25-minute limit. Weekly and monthly audits can use up to 60 and 100 minutes.
The implementation worker runs every two hours but skips the model entirely
when no eligible issue is waiting. A worker handles one issue per invocation,
and retries failed setup or model runs no more than once every six hours.

Security inspections and weekly/monthly deep audits use `opencode-go/glm-5.3-flash`; other maintenance jobs use `opencode-go/muse-spark-1.3-contributor`. The workflow selects the model from the scheduled category. Finding limits are three for daily jobs, five for the dependency review, eight
for weekly audits, and twelve for monthly audits. A candidate still needs a
valid repository path and line, evidence, impact, a high confidence score, and
a fingerprint not present in the existing issue backlog. OpenCode's CLI is
installed from the exact npm package version `opencode-ai@1.18.32`. Update the
version deliberately after reviewing a release.

## PR review format

  The first-look workflow runs for eligible PR opens, new commits, reopenings, and
  ready-for-review events. A lightweight, read-only job waits up to 45 minutes
  outside the shared OpenCode queue for the exact revision's `Checks | CI` run.
  Once CI completes, the review job enters the shared queue and runs OpenCode.
  This keeps slow CI for one PR from delaying unrelated OpenCode work. The run
  fails clearly if CI never completes and skips the stale review if the PR head
changes while it waits. The owner can also comment `/review-opencode` on the PR
timeline to request a fresh review without opening Actions. Other users'
commands are ignored. Duplicate event deliveries are idempotent, while each
distinct owner command can request one new run.

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

  The CI waiter token is limited to pull-request and Actions read. The separate
  review job token is limited to repository contents read, issue read,
  pull-request write, and checks read. The
OpenCode process receives no GitHub token and is instructed not to edit, run
commands, approve, request changes, push, or merge. The GitHub Actions publisher
validates structured output and updates the single bot comment. It cannot merge,
release, deploy, or change repository settings. To request a review from a PR,
comment exactly `/review-opencode`; only the repository owner can invoke it.

## Turning jobs off

Each system has its own workflow and can be disabled from the repository's
Actions settings without affecting the others:

- PR first-look review: `opencode-first-look.yml`
- Changelog audit: `opencode-changelog-audit.yml`
- Issue triage: `opencode-issue-triage.yml`
- Daily, dependency, weekly, and monthly investigations: `opencode-scheduled-maintenance.yml`
- Audit implementation workers: `opencode-audit-issue-worker.yml`

The manual comment-driven workflow in `opencode.yml` remains a separate,
maintainer-requested path. The bounded research workflow can also be disabled
independently in Actions.
