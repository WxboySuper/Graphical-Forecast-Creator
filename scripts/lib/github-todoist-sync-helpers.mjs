const METADATA_PREFIX = "GFC-GitHub:";

const normalize = (value) => String(value || "").trim().toLowerCase();

export function parseMetadata(description = "") {
  const line = description.split("\n").find((entry) => entry.startsWith(METADATA_PREFIX));
  if (!line) return null;
  const metadata = Object.fromEntries(line.slice(METADATA_PREFIX.length).trim().split(" ").map((part) => part.split("=")));
  return metadata.key && metadata.type ? metadata : null;
}

export function routeProjectId(item, config) {
  const labels = new Set((item.labels || []).map(normalize));
  const milestone = normalize(item.milestone?.title);
  const routeMatches = (route) => (route.labels || []).some((label) => labels.has(normalize(label))) ||
    (route.milestones || []).map(normalize).includes(milestone);
  return String(config.routes?.find(routeMatches)?.projectId || config.defaultProjectId);
}

function issueAction(item) {
  const labels = new Set((item.labels || []).map(normalize));
  if (labels.has("bug")) return `Fix issue #${item.number}`;
  if (labels.has("documentation") || labels.has("docs")) return `Update documentation for issue #${item.number}`;
  if (labels.has("enhancement") || labels.has("feature")) return `Implement issue #${item.number}`;
  return `Investigate and resolve issue #${item.number}`;
}

function stateText(item) {
  if (item.state === "MERGED" || item.mergedAt) return "merged";
  if (normalize(item.state) === "closed") return "closed";
  if (item.type === "pr" && item.isDraft) return "draft";
  return normalize(item.state) || "open";
}

export function taskContent(item) {
  if (item.type === "pr") return `Review PR #${item.number} — ${item.title}`;
  return `${issueAction(item)}: ${item.title}`;
}

export function shouldCreateTask(item, existingTask, now = Date.now(), relevanceDays = 90) {
  if (existingTask) return true;
  if (item.type === "pr" && item.isDraft) return false;
  if (normalize(item.state) !== "open" || !item.updatedAt) return false;
  const updatedAt = Date.parse(item.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt <= relevanceDays * 24 * 60 * 60 * 1000;
}

export function taskDescription(item, relationships) {
  const related = relationships[item.key] || {};
  const closing = (related.closing || []).map((entry) => `#${entry.number}`).join(", ") || "none";
  const closedBy = (related.closedBy || []).map((entry) => `#${entry.number}`).join(", ") || "none";
  return [
    `${METADATA_PREFIX} key=${item.key} type=${item.type}`,
    `GitHub: ${item.url}`,
    `GitHub state: ${stateText(item)}`,
    `GitHub milestone: ${item.milestone?.title || "none"}`,
    `GitHub labels: ${(item.labels || []).join(", ") || "none"}`,
    `Closing issues: ${closing}`,
    `Closed by PRs: ${closedBy}`,
    "Todoist task stays open until a person completes the work and checks it off.",
  ].join("\n");
}

export function buildRelationships(issues, prs) {
  const relationships = {};
  const ensure = (key) => (relationships[key] ||= { closing: [], closedBy: [] });
  const repository = issues[0]?.key.split(":")[0] || prs[0]?.key.split(":")[0];
  const refKey = (type, number) => `${repository}:${type}#${number}`;
  const addIssue = (issue) => {
    const closingPrs = issue.closedByPullRequestsReferences.nodes;
    ensure(issue.key).closedBy = closingPrs;
    closingPrs.forEach((pr) => ensure(refKey("pr", pr.number)).closing.push(issue));
  };
  const addPr = (pr) => {
    const closingIssues = pr.closingIssuesReferences.nodes;
    ensure(pr.key).closing = closingIssues;
    closingIssues.forEach((issue) => ensure(refKey("issue", issue.number)).closedBy.push(pr));
  };
  issues.forEach(addIssue);
  prs.forEach(addPr);
  return relationships;
}
