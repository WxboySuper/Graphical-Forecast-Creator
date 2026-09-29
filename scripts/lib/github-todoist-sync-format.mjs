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
