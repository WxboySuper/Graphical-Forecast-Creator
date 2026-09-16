# GitHub to Todoist sync

GitHub stays the source of truth for issues and pull requests. Todoist holds the human work that needs to happen. The sync runs in GitHub Actions from `.github/workflows/github-todoist-sync.yml`.

## Configuration

Create these repository settings under `Settings > Secrets and variables > Actions`.

Secret:

- `TODOIST_API_TOKEN`: a Todoist API token with access to the GFC workspace.

Repository variables:

- `TODOIST_MAINTENANCE_PROJECT_ID`: the Todoist subproject ID for Maintenance. This is the fallback route.
- `TODOIST_PROJECT_ROUTES_JSON`: the route list, including the other three Todoist project IDs.

Set `TODOIST_PROJECT_ROUTES_JSON` to a JSON array. Replace the placeholders with the Todoist subproject IDs. Change the labels or milestone names when the GitHub taxonomy changes.

```json
[
  {"projectId":"<Repo Audit ID>","labels":["repo-audit","audit"]},
  {"projectId":"<v1.8 ID>","milestones":["v1.8"]},
  {"projectId":"<Infrastructure ID>","labels":["infrastructure"]},
  {"projectId":"<Maintenance ID>","labels":["maintenance"]}
]
```

The first matching route wins. A task with no matching label or milestone goes to Maintenance. Todoist project IDs are configuration only. They are never committed as source values.

## What appears in Todoist

Every description starts with a stable line such as:

```text
GFC-GitHub: key=Wxboysuper/Graphical-Forecast-Creator:issue#42 type=issue
```

That key is the deduplication record. It includes the repository, GitHub object type, and number, so issue #42 and PR #42 remain separate tasks. The script lists existing Todoist tasks, reads this line, and creates or updates the matching task. It never uses a title match.

Pull requests use exactly this task title:

```text
Review PR #42 — Improve radar loading
```

Issues use an action title based on labels, followed by the issue title:

```text
Fix issue #42: Radar loading fails on slow connections
Implement issue #43: Add storm report filters
Update documentation for issue #44: Document verification workflow
Investigate and resolve issue #45: Clarify the forecast export flow
```

No Todoist due date is sent. Routing uses the issue or PR milestone and labels.

Draft PRs are scanned so their relationships can update issue descriptions, but they do not create Todoist tasks. When a draft becomes ready, the next hourly reconciliation or manual dispatch creates `Review PR #42 — Improve radar loading`.

## Issue to linked PR to completion

The script reads GitHub GraphQL's `closedByPullRequestsReferences` and `closingIssuesReferences` fields. It does not parse titles or PR body text.

An issue task includes:

```text
GitHub state: open
Closing issues: none
Closed by PRs: #42
```

A PR task includes:

```text
GitHub state: open
Closing issues: #41
Closed by PRs: none
```

When PR #42 merges, its task changes to `GitHub state: merged`. The linked issue task is also updated when GitHub reports the issue as closed, and shows `GitHub state: closed` plus the closing PR number. When an issue closes without a merged PR, it shows `GitHub state: closed` and `Closed by PRs: none`.

The sync never completes or deletes Todoist tasks. A closed or merged GitHub object leaves its Todoist task open so the person who did the work can check it off manually and receive Todoist Momentum credit.

## Running it

Issue events, the hourly schedule, and `workflow_dispatch` run the sync. Pull request workflow runs are intentionally skipped because pull request jobs do not reliably receive repository secrets, so PR lifecycle changes such as ready-for-review, merge, reopen, label, and milestone changes are reconciled within the next hour or by manual dispatch.

The reconciliation reads all GitHub issues and pull requests so it can resolve relationship data, but its inclusion rule limits task creation to open issues and open, ready-for-review PRs. Closed issues and merged or closed PRs are only updated when a matching Todoist task already exists. The first run therefore does not import the repository's historical archive.

The implementation has no database or service. GitHub Actions and the stable description line provide the state needed for safe reruns.
