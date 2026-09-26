# OpenCode maintenance jobs

GFC's maintenance runner reuses the OpenCode GitHub Action already used by
`.github/workflows/opencode.yml`. The automatic first-look review lives in
`.github/workflows/opencode-first-look.yml`. It is a bounded review job, not an
agent that stays active between runs.

## First-look review

The workflow runs on `opened`, `synchronize`, `reopened`, and
`ready_for_review` pull request events. It skips drafts, fork branches, and PRs
whose author is not an owner, member, or collaborator. Fork PRs do not receive
the model API key through this workflow. A run has a 20-minute timeout and is
serialized per PR.

The job checks out the PR base revision with checkout credentials disabled.
The OpenCode GitHub integration retrieves PR context and performs its own
checkout to review the change. The prompt treats repository and PR content as
untrusted input and permits findings only. OpenCode's edit, write, and shell
tools are denied. The prompt asks for concrete findings with impact and file
references, and asks for a short no-findings result when appropriate.

The job token grants `contents: read`, `pull-requests: read`, and `issues: write`.
It needs issue write access to publish or update the PR conversation comment.
It has no contents write permission, so it cannot push a branch. It has no
`pull-requests: write` permission, so it cannot submit reviews or merge a PR.
It does not receive an ID token or a personal access token. Existing branch
protection remains responsible for merge policy.

## Deduplication and failure behavior

The review is keyed to the exact PR head SHA. Before invoking OpenCode, the
workflow confirms that the event still matches the current head and scans PR
comments for `<!-- gfc-opencode-first-look:<sha> -->`. The prompt asks OpenCode
to include that marker in its result. Repeated events for a completed revision
then stop before consuming model time. If a run fails before it publishes the
marker, a later event can retry. A stale event exits without reviewing an older
revision. Concurrency queues revisions for the same PR instead of running
duplicates at once.

This state is intentionally stored in the PR conversation itself. It follows
the PR and needs no database, cache, or scheduled cleanup. If OpenCode fails,
GitHub Actions records the failed run; the next meaningful PR event can retry.
The job never merges, releases, deploys, changes repository settings, or pushes
to a protected branch.

## Configuration and limits

The workflow uses the existing `OPENCODE_API_KEY` repository or organization
Actions secret and the model already configured in the manual runner. It does
not set up any additional credentials. The workflow is limited to trusted
same-repository contributors because the OpenCode action checks out the PR
branch internally. Do not broaden that filter or use `pull_request_target`
without first changing how untrusted PR code reaches the runner.

Review only runs for the listed PR event types. The per-PR concurrency group,
head-SHA comment marker, 20-minute timeout, and low-authority token limit repeat
work and cost. Empty findings should be brief. Do not create issues just to
record speculative concerns.

## Adding a maintenance job

Add each job as a separate workflow or separately permissioned job. Define its
event, narrow task prompt, input context, time limit, expected output, and
termination condition. Give its token only the permissions needed for that
output. Choose a durable deduplication key before enabling recurring triggers.
For scheduled work, record the inspected scope and last successful run in a
small repository-native state file or issue, and update it only after a
successful investigation. Open issues or PRs only for findings that include
reproducible evidence and a clear user impact. Keep dependency upgrades,
deployment, release, merge, and repository administration out of autonomous
permissions.
