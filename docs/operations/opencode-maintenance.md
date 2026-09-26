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
| PR first-look | PR opened, new commits, reopened, ready for review | One review comment per revision and event review type |
| CI supplement | `Checks | CI` completes for an associated PR | One supplemental comment per revision after check results are available |
| Issue triage | A non-bot issue opens | Code-backed context or one focused request for missing information |
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

The weekly bug hunt rotates through `src/monitor`, `src/forecast`,
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
release, or deployment tools. It cannot commit or push. The workflow installs
dependencies before starting OpenCode, then a separate step checks the staged
diff, runs related Jest tests, runs ESLint for source changes, runs TypeScript
checking for TypeScript changes, and builds the application for `src/` changes.
That validation step does not receive the model key or GitHub token.

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
and 2,000 patch characters per file. Its token can read contents, PRs, and
checks, and post an issue comment. It has no contents or pull-request write
permission. The model can only read, list, and search the checkout.

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

The state comment is updated first. The same full state is then written back
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
| PR first-look | `contents: read`, `pull-requests: read`, `checks: read`, `issues: write` |
| Issue triage | `contents: read`, `issues: write` |
| Scheduled investigations | `contents: read`, `issues: write`, `security-events: read` |
| Audit issue worker | `contents: write`, `issues: write`, `pull-requests: write`, `actions: write` for the isolated publisher job |

The audit worker's GitHub token is available only to GitHub Actions steps. The
model receives only `OPENCODE_API_KEY`, read access, and scoped file editing.
GitHub API calls that create issues, update labels, push a worker branch, open
a PR, or dispatch first-look review live in separate workflow steps. No job
gets deployment or release permissions. No job can change repository settings
or branch protection. Protected branches remain guarded by repository rules;
all merges are human decisions.

## Compute and output limits

Daily inspections have 15- to 20-minute model limits. Dependency review has a
25-minute limit. Weekly and monthly audits can use up to 60 and 100 minutes.
The implementation worker runs every two hours but skips the model entirely
when no eligible issue is waiting. A worker handles one issue per invocation,
and retries failed setup or model runs no more than once every six hours.

Finding limits are three for daily jobs, five for the dependency review, eight
for weekly audits, and twelve for monthly audits. A candidate still needs a
valid repository path and line, evidence, impact, a high confidence score, and
a fingerprint not present in the existing issue backlog. OpenCode's CLI is
installed from the exact npm package version `opencode-ai@1.18.32`. Update the
version deliberately after reviewing a release.

## Turning jobs off

Each system has its own workflow and can be disabled from the repository's
Actions settings without affecting the others:

- PR review and CI supplement: `opencode-first-look.yml`
- Issue triage: `opencode-issue-triage.yml`
- Daily, dependency, weekly, and monthly investigations: `opencode-scheduled-maintenance.yml`
- Audit implementation workers: `opencode-audit-issue-worker.yml`

The manual comment-driven workflow in `opencode.yml` remains a separate,
maintainer-requested path. The bounded research workflow can also be disabled
independently in Actions.
