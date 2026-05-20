#!/usr/bin/env bash
set -euo pipefail

echo "Merging ${SOURCE_BRANCH} into ${BASE_BRANCH}. Porting to relevant branches..."

append_summary() {
  echo "$1" >> "${GITHUB_STEP_SUMMARY}"
}

append_summary "## PR porting — #${PR_NUMBER}"
append_summary ""
append_summary "Source: \`${SOURCE_BRANCH}\` → \`${BASE_BRANCH}\`"
append_summary ""

# Fetch all active branches
gh api repos/"${REPO}"/branches --paginate > branches.json

# Resolve the original PR commits so port branches only carry the
# intended change set instead of every commit missing from target.
git fetch origin pull/"${PR_NUMBER}"/head:refs/remotes/origin/pr/"${PR_NUMBER}"
gh api repos/"${REPO}"/pulls/"${PR_NUMBER}"/commits --paginate > pr-commits.json
mapfile -t PR_COMMIT_SHAS < <(jq -r '.[].sha' pr-commits.json)

if [[ ${#PR_COMMIT_SHAS[@]} -eq 0 ]]; then
  echo "::error title=Porting aborted::No source PR commits found for #${PR_NUMBER}."
  append_summary "### Result: failed"
  append_summary "No source PR commits were found."
  exit 1
fi

TARGETS=()

if [[ "${BASE_BRANCH}" == "main" ]]; then
  TARGETS+=("beta")

  HOTFIX_BRANCHES=$(jq -r '.[].name | select(startswith("hotfix/"))' branches.json)
  for b in $HOTFIX_BRANCHES; do
    if [[ "${b}" != "${SOURCE_BRANCH}" ]]; then
      TARGETS+=("${b}")
    fi
  done

  FEATURE_BRANCHES=$(jq -r '.[].name | select(startswith("feature/"))' branches.json)
  for b in $FEATURE_BRANCHES; do
    TARGETS+=("${b}")
  done

elif [[ "${BASE_BRANCH}" == "beta" ]]; then
  FEATURE_BRANCHES=$(jq -r '.[].name | select(startswith("feature/"))' branches.json)
  for b in $FEATURE_BRANCHES; do
    if [[ "${b}" != "${SOURCE_BRANCH}" ]]; then
      TARGETS+=("${b}")
    fi
  done
fi

FAILURES=()
CONFLICT_PR_URLS=()
SUCCESS_COUNT=0
SKIPPED_COUNT=0

create_or_update_conflict_pr() {
  local target="$1"
  local port_branch="$2"
  local conflict_files="$3"
  local port_method="$4"

  git push --force-with-lease origin "${port_branch}"

  local body
  body="$(cat <<EOF
## Automated port needs conflict resolution

This **draft** PR was opened because the porting workflow could not apply the changes cleanly onto \`${target}\`.

| | |
| --- | --- |
| Original PR | #${PR_NUMBER} — ${PR_TITLE} |
| Source branch | \`${SOURCE_BRANCH}\` (merged into \`${BASE_BRANCH}\`) |
| Port method attempted | ${port_method} |

### Conflicted files

${conflict_files}

### What to do

1. Open this draft PR and edit the conflicted files (GitHub UI or local checkout of \`${port_branch}\`).
2. Remove conflict markers. For \`pnpm-lock.yaml\` / \`package-lock.json\` conflicts, prefer checking out this branch locally, aligning \`package.json\` with #${PR_NUMBER}, then running \`pnpm install\` and committing the regenerated lockfile.
3. Mark this PR **ready for review**, then merge when CI passes.

The branch intentionally contains unresolved conflict markers so you are not left rebuilding the port from scratch.

Keeping this branch current avoids \`${target}\` drifting behind \`${BASE_BRANCH}\`.
EOF
)"

  local existing_pr
  existing_pr="$(gh pr list --repo "${REPO}" --head "${port_branch}" --base "${target}" --state open --json number,url -q '.[0] | "\(.number)\t\(.url)"' 2>/dev/null || true)"

  local pr_url
  if [[ -n "${existing_pr}" && "${existing_pr}" != "null" ]]; then
    local pr_num="${existing_pr%%$'\t'*}"
    pr_url="${existing_pr#*$'\t'}"
    gh pr edit "${pr_num}" --repo "${REPO}" --draft --body "${body}" || true
    gh pr comment "${pr_num}" --repo "${REPO}" --body "Port branch updated after a new merge into \`${BASE_BRANCH}\`. Please re-check conflict resolution." || true
    echo "Updated existing draft port PR #${pr_num} for ${target}"
  else
    gh label create "porting/conflicts" --repo "${REPO}" --color "B60205" --description "Automated port PR that needs manual conflict resolution" 2>/dev/null || true
    pr_url="$(gh pr create --repo "${REPO}" \
      --head "${port_branch}" \
      --base "${target}" \
      --draft \
      --title "[Port][Conflicts] ${PR_TITLE} → ${target}" \
      --body "${body}" \
      --label "porting/conflicts")"
    echo "Opened draft conflict port PR for ${target}: ${pr_url}"
  fi

  CONFLICT_PR_URLS+=("${target}|${pr_url}|${conflict_files}")
  FAILURES+=("${target}")
}

has_unmerged_conflicts() {
  [[ -n "$(git diff --name-only --diff-filter=U)" ]]
}

commit_conflict_wip() {
  local target="$1"
  local port_branch="$2"
  local port_method="$3"

  mapfile -t conflict_paths < <(git diff --name-only --diff-filter=U)
  local conflict_files="- _(none detected)_"
  if [[ ${#conflict_paths[@]} -gt 0 ]]; then
    conflict_files=""
    for f in "${conflict_paths[@]}"; do
      conflict_files+=$'\n'"- \`${f}\`"
    done
  fi

  git add -A
  if ! git -c core.hooksPath=/dev/null commit --no-verify -m "chore(port): WIP — resolve conflicts porting #${PR_NUMBER} to ${target}

Automated port from ${SOURCE_BRANCH} (merged to ${BASE_BRANCH}).
Resolve conflict markers in the files below, then mark the draft PR ready for review.

Port method attempted: ${port_method}
Conflicted paths:
$(printf '%s\n' "${conflict_paths[@]}")"; then
    echo "::error title=Port conflicts not committed::Could not commit conflict state for ${target}."
    FAILURES+=("${target}")
    return 1
  fi

  create_or_update_conflict_pr "${target}" "${port_branch}" "${conflict_files}" "${port_method}"
}

reset_port_branch() {
  local target="$1"
  local port_branch="$2"
  git cherry-pick --abort 2>/dev/null || true
  git merge --abort 2>/dev/null || true
  git checkout -B "${port_branch}" "origin/${target}"
}

for TARGET in "${TARGETS[@]}"; do
  echo "--- Attempting to port to ${TARGET} ---"

  PORT_BRANCH="port/${PR_NUMBER}-to-${TARGET//\//-}"

  if ! git ls-remote --exit-code --heads origin "${TARGET}" > /dev/null; then
    echo "Branch ${TARGET} no longer exists. Skipping."
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  git fetch origin "${TARGET}"
  git checkout -B "${PORT_BRANCH}" "origin/${TARGET}"

  COMMITS_TO_PICK=()
  for SHA in "${PR_COMMIT_SHAS[@]}"; do
    if git merge-base --is-ancestor "${SHA}" "origin/${TARGET}"; then
      echo "Commit ${SHA} already exists on ${TARGET}. Skipping it."
      continue
    fi
    COMMITS_TO_PICK+=("${SHA}")
  done

  if [[ ${#COMMITS_TO_PICK[@]} -eq 0 ]]; then
    echo "No source PR commits need porting to ${TARGET}. Skipping."
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    git checkout "${BASE_BRANCH}"
    git branch -D "${PORT_BRANCH}" || true
    continue
  fi

  PORTED=false
  PORT_METHOD="cherry-pick"

  if git cherry-pick "${COMMITS_TO_PICK[@]}"; then
    PORTED=true
  elif has_unmerged_conflicts; then
    echo "Cherry-pick stopped on conflicts for ${TARGET}; publishing draft port PR."
    PORT_METHOD="cherry-pick (conflicts)"
    if commit_conflict_wip "${TARGET}" "${PORT_BRANCH}" "${PORT_METHOD}"; then
      echo "::error title=Port conflicts::#${PR_NUMBER} → ${TARGET} needs conflict resolution. Draft PR pushed on ${PORT_BRANCH}."
    fi
    git checkout "${BASE_BRANCH}"
    git branch -D "${PORT_BRANCH}" || true
    continue
  else
    echo "Cherry-pick failed for ${TARGET} without index conflicts; trying merge fallback."
    reset_port_branch "${TARGET}" "${PORT_BRANCH}"

    PORT_METHOD="merge (PR head)"
    MERGE_MSG="Port PR #${PR_NUMBER} (${SOURCE_BRANCH}) into ${TARGET}"
    if git merge --no-ff -m "${MERGE_MSG}" "origin/pr/${PR_NUMBER}"; then
      PORTED=true
    elif has_unmerged_conflicts; then
      echo "Merge fallback has conflicts for ${TARGET}; publishing draft port PR."
      if commit_conflict_wip "${TARGET}" "${PORT_BRANCH}" "${PORT_METHOD}"; then
        echo "::error title=Port conflicts::#${PR_NUMBER} → ${TARGET} needs conflict resolution. Draft PR pushed on ${PORT_BRANCH}."
      fi
      git checkout "${BASE_BRANCH}"
      git branch -D "${PORT_BRANCH}" || true
      continue
    else
      echo "::error title=Port failed::Cherry-pick and merge both failed for ${TARGET} without resolvable conflict state."
      FAILURES+=("${TARGET}")
      git checkout "${BASE_BRANCH}"
      git branch -D "${PORT_BRANCH}" || true
      continue
    fi
  fi

  if [[ "${PORTED}" != "true" ]]; then
    FAILURES+=("${TARGET}")
    git checkout "${BASE_BRANCH}"
    git branch -D "${PORT_BRANCH}" || true
    continue
  fi

  git push --force-with-lease origin "${PORT_BRANCH}"

  PR_BODY="Automated port of the original commits from PR #${PR_NUMBER} into \`${TARGET}\` after merge into \`${BASE_BRANCH}\`."
  if [[ "${PORT_METHOD}" != "cherry-pick" ]]; then
    PR_BODY="${PR_BODY}

> Note: Changes were applied via **${PORT_METHOD}** because cherry-pick did not apply cleanly."
  fi

  if ! gh pr create --repo "${REPO}" \
    --head "${PORT_BRANCH}" \
    --base "${TARGET}" \
    --title "[Port] ${PR_TITLE} to ${TARGET}" \
    --body "${PR_BODY}"; then
    echo "::warning title=Port PR not created::Could not open a port PR for ${TARGET} (branch ${PORT_BRANCH} was pushed)."
    FAILURES+=("${TARGET}")
    git push origin --delete "${PORT_BRANCH}" || true
  else
    echo "Successfully created port PR for ${TARGET} using ${PORT_BRANCH}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  fi

  git checkout "${BASE_BRANCH}"
  git branch -D "${PORT_BRANCH}" || true
done

if [[ "${SOURCE_BRANCH}" != "main" && "${SOURCE_BRANCH}" != "beta" ]]; then
  echo "--- Cleaning up original source branch ${SOURCE_BRANCH} ---"
  if git ls-remote --exit-code --heads origin "${SOURCE_BRANCH}" > /dev/null; then
    gh api -X DELETE repos/"${REPO}"/git/refs/heads/"${SOURCE_BRANCH}" || echo "Note: Source branch ${SOURCE_BRANCH} was already deleted or is protected."
  else
    echo "Source branch ${SOURCE_BRANCH} already removed from origin."
  fi
fi

append_summary "### Summary"
append_summary "- Successful port PRs: **${SUCCESS_COUNT}**"
append_summary "- Skipped (already synced / missing branch): **${SKIPPED_COUNT}**"
append_summary "- Needs attention: **${#FAILURES[@]}**"
append_summary ""

if [[ ${#FAILURES[@]} -eq 0 ]]; then
  append_summary "All required targets were ported or already up to date."
  echo "Porting completed successfully."
  exit 0
fi

append_summary "### Targets needing attention"
append_summary ""
append_summary "| Target | Draft conflict PR |"
append_summary "| --- | --- |"
for entry in "${CONFLICT_PR_URLS[@]}"; do
  IFS='|' read -r t url _ <<< "${entry}"
  append_summary "| \`${t}\` | [open draft PR](${url}) |"
done
for f in "${FAILURES[@]}"; do
  if [[ ${#CONFLICT_PR_URLS[@]} -eq 0 ]] || ! printf '%s\n' "${CONFLICT_PR_URLS[@]}" | grep -q "^${f}|"; then
    append_summary "| \`${f}\` | _(no draft PR — see workflow log)_ |"
  fi
done

ISSUE_TITLE="[Port] Conflict resolution needed for PR #${PR_NUMBER}"
ISSUE_BODY="$(cat <<EOF
## Automated porting could not finish cleanly

PR #${PR_NUMBER} (**${PR_TITLE}**) was merged into \`${BASE_BRANCH}\`, but one or more downstream branches still need a manual port.

| Target branch | Action |
| --- | --- |
EOF
)"
for entry in "${CONFLICT_PR_URLS[@]}"; do
  IFS='|' read -r t url files <<< "${entry}"
  ISSUE_BODY+=$'\n'"| \`${t}\` | Resolve [draft port PR](${url}) |"
done
for f in "${FAILURES[@]}"; do
  if ! printf '%s\n' "${CONFLICT_PR_URLS[@]}" | grep -q "^${f}|"; then
    ISSUE_BODY+=$'\n'"| \`${f}\` | Check the [failed workflow run](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}) |"
  fi
done
ISSUE_BODY+=$'\n\n'"Author: @${PR_AUTHOR}

When these draft PRs are merged, \`${BASE_BRANCH}\` changes will stay aligned across active feature and hotfix branches."

EXISTING_ISSUE="$(gh issue list --repo "${REPO}" --search "in:title \"${ISSUE_TITLE}\"" --state open --json number -q '.[0].number' 2>/dev/null || true)"
if [[ -n "${EXISTING_ISSUE}" && "${EXISTING_ISSUE}" != "null" ]]; then
  gh issue comment "${EXISTING_ISSUE}" --repo "${REPO}" --body "${ISSUE_BODY}" || true
  ISSUE_URL="${GITHUB_SERVER_URL}/${REPO}/issues/${EXISTING_ISSUE}"
  echo "Updated open tracking issue #${EXISTING_ISSUE}"
else
  gh label create "porting" --repo "${REPO}" --color "FBCA04" --description "Branch porting automation follow-up" 2>/dev/null || true
  ISSUE_URL="$(gh issue create --repo "${REPO}" \
    --title "${ISSUE_TITLE}" \
    --body "${ISSUE_BODY}" \
    --label "porting" \
    --assignee "${PR_AUTHOR}" 2>/dev/null)" || \
  ISSUE_URL="$(gh issue create --repo "${REPO}" \
    --title "${ISSUE_TITLE}" \
    --body "${ISSUE_BODY}" \
    --label "porting")"
  echo "Created tracking issue: ${ISSUE_URL}"
fi

append_summary ""
append_summary "Tracking issue: ${ISSUE_URL}"

FAILURE_COMMENT="$(cat <<EOF
### ⚠️ Automated porting needs your attention

PR #${PR_NUMBER} was merged into \`${BASE_BRANCH}\`, but **${#FAILURES[@]}** branch(es) still need a port.

EOF
)"
if [[ ${#CONFLICT_PR_URLS[@]} -gt 0 ]]; then
  FAILURE_COMMENT+="**Draft PRs were opened with conflict markers** — resolve them and mark ready for review:\n\n"
  for entry in "${CONFLICT_PR_URLS[@]}"; do
    IFS='|' read -r t url _ <<< "${entry}"
    FAILURE_COMMENT+="- \`${t}\`: ${url}\n"
  done
  FAILURE_COMMENT+="\n"
fi

for f in "${FAILURES[@]}"; do
  if ! printf '%s\n' "${CONFLICT_PR_URLS[@]}" | grep -q "^${f}|"; then
    FAILURE_COMMENT+="- \`${f}\`: port PR could not be created (see [workflow run](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}))\n"
  fi
done

FAILURE_COMMENT+="\nTracking issue: ${ISSUE_URL}\n\nWorkflow summary: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

gh pr comment "${PR_NUMBER}" --repo "${REPO}" --body "$(echo -e "${FAILURE_COMMENT}")"

for f in "${FAILURES[@]}"; do
  echo "::error title=Port needs attention::${f} — see draft port PRs and ${ISSUE_URL}"
done

exit 1
