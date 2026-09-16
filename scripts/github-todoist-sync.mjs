#!/usr/bin/env node

const GITHUB_API = "https://api.github.com/graphql";
const TODOIST_API = "https://api.todoist.com/api/v1";
const METADATA_PREFIX = "GFC-GitHub:";

const githubQuery = `
  query($owner: String!, $name: String!, $issueCursor: String, $prCursor: String) {
    repository(owner: $owner, name: $name) {
      issues(first: 100, after: $issueCursor, states: [OPEN, CLOSED], orderBy: {field: UPDATED_AT, direction: DESC}) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number title url state updatedAt closedAt
          milestone { title }
          labels(first: 50) { nodes { name } }
          closedByPullRequestsReferences(first: 50) { nodes { number title url state mergedAt } }
        }
      }
      pullRequests(first: 100, after: $prCursor, states: [OPEN, CLOSED], orderBy: {field: UPDATED_AT, direction: DESC}) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number title url state isDraft updatedAt closedAt mergedAt
          milestone { title }
          labels(first: 50) { nodes { name } }
          closingIssuesReferences(first: 50) { nodes { number title url state } }
        }
      }
    }
  }
`;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must contain valid JSON: ${error.message}`);
  }
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function parsePositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function parseMetadata(description = "") {
  const line = description.split("\n").find((entry) => entry.startsWith(METADATA_PREFIX));
  if (!line) return null;
  const metadata = {};
  for (const part of line.slice(METADATA_PREFIX.length).trim().split(" ")) {
    const separator = part.indexOf("=");
    if (separator > 0) metadata[part.slice(0, separator)] = part.slice(separator + 1);
  }
  return metadata.key && metadata.type ? metadata : null;
}

export function routeProjectId(item, config) {
  const labels = new Set((item.labels || []).map(normalize));
  const milestone = normalize(item.milestone?.title);
  const routes = config.routes || {};
  for (const route of routes) {
    const routeLabels = (route.labels || []).map(normalize);
    const routeMilestones = (route.milestones || []).map(normalize);
    if (routeLabels.some((label) => labels.has(label)) || routeMilestones.includes(milestone)) {
      return String(route.projectId);
    }
  }
  return String(config.defaultProjectId);
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
  const status = stateText(item);
  return [
    `${METADATA_PREFIX} key=${item.key} type=${item.type}`,
    `GitHub: ${item.url}`,
    `GitHub state: ${status}`,
    `GitHub milestone: ${item.milestone?.title || "none"}`,
    `GitHub labels: ${(item.labels || []).join(", ") || "none"}`,
    `Closing issues: ${closing}`,
    `Closed by PRs: ${closedBy}`,
    "Todoist task stays open until a person completes the work and checks it off.",
  ].join("\n");
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  let data;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
}

async function githubGraphql(token, variables) {
  const result = await request(GITHUB_API, {
    method: "POST",
    headers: { accept: "application/vnd.github+json", authorization: `bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: githubQuery, variables }),
  });
  if (result.errors?.length) throw new Error(result.errors.map((error) => error.message).join("; "));
  return result.data.repository;
}

async function collectGithubItems(token, owner, name) {
  const issues = [];
  const prs = [];
  let issueCursor = null;
  do {
    const page = await githubGraphql(token, { owner, name, issueCursor, prCursor: null });
    issues.push(...page.issues.nodes.filter(Boolean));
    issueCursor = page.issues.pageInfo.hasNextPage ? page.issues.pageInfo.endCursor : null;
  } while (issueCursor);
  let prCursor = null;
  do {
    const page = await githubGraphql(token, { owner, name, issueCursor: null, prCursor });
    prs.push(...page.pullRequests.nodes.filter(Boolean));
    prCursor = page.pullRequests.pageInfo.hasNextPage ? page.pullRequests.pageInfo.endCursor : null;
  } while (prCursor);
  return { issues, prs };
}

function toItem(raw, type, owner, name) {
  return {
    ...raw,
    type,
    key: `${owner}/${name}:${type}#${raw.number}`,
    labels: raw.labels.nodes.map((label) => label.name),
  };
}

async function todoistRequest(token, path, options = {}) {
  return request(`${TODOIST_API}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) },
  });
}

async function listTodoistTasks(token) {
  const tasks = [];
  let cursor;
  do {
    const query = cursor ? `?limit=200&cursor=${encodeURIComponent(cursor)}` : "?limit=200";
    const page = await todoistRequest(token, `/tasks${query}`);
    tasks.push(...(page.results || page));
    cursor = page.next_cursor || null;
  } while (cursor);
  return tasks;
}

function buildRelationships(issues, prs) {
  const relationships = {};
  const ensure = (key) => (relationships[key] ||= { closing: [], closedBy: [] });
  const refKey = (type, number) => `${issues[0]?.key.split(":")[0] || prs[0]?.key.split(":")[0]}:${type}#${number}`;
  const addIssue = (issue) => {
    const closingPrs = issue.closedByPullRequestsReferences.nodes;
    ensure(issue.key).closedBy = closingPrs;
    for (const pr of closingPrs) ensure(refKey("pr", pr.number)).closing.push(issue);
  };
  const addPr = (pr) => {
    const closingIssues = pr.closingIssuesReferences.nodes;
    ensure(pr.key).closing = closingIssues;
    for (const issue of closingIssues) ensure(refKey("issue", issue.number)).closedBy.push(pr);
  };
  issues.forEach(addIssue);
  prs.forEach(addPr);
  return relationships;
}

async function loadExistingTasks(token) {
  const existing = new Map();
  for (const task of await listTodoistTasks(token)) {
    const metadata = parseMetadata(task.description);
    if (metadata?.key) existing.set(metadata.key, task);
  }
  return existing;
}

function taskPayload(item, relationships, config) {
  return {
    content: taskContent(item),
    description: taskDescription(item, relationships),
    project_id: routeProjectId(item, config),
  };
}

async function upsertTask(token, item, existingTask, payload) {
  if (!existingTask) {
    await todoistRequest(token, "/tasks", { method: "POST", body: JSON.stringify(payload) });
    return "created";
  }
  const changed = existingTask.content !== payload.content ||
    existingTask.description !== payload.description ||
    String(existingTask.project_id) !== payload.project_id;
  if (!changed) return "unchanged";
  await todoistRequest(token, `/tasks/${existingTask.id}`, { method: "POST", body: JSON.stringify(payload) });
  return "updated";
}

async function sync() {
  const todoistToken = required("TODOIST_API_TOKEN");
  const [owner, name] = required("GITHUB_REPOSITORY").split("/");
  const githubToken = required("GITHUB_TOKEN");
  const config = {
    defaultProjectId: required("TODOIST_DEFAULT_PROJECT_ID"),
    routes: parseJsonEnv("TODOIST_PROJECT_ROUTES_JSON", []),
    relevanceDays: parsePositiveIntEnv("TODOIST_RELEVANCE_DAYS", 90),
  };
  const github = await collectGithubItems(githubToken, owner, name);
  const issues = github.issues.map((item) => toItem(item, "issue", owner, name));
  const prs = github.prs.map((item) => toItem(item, "pr", owner, name));
  const relationships = buildRelationships(issues, prs);
  const existing = await loadExistingTasks(todoistToken);
  const now = Date.now();
  const wanted = [...issues, ...prs].filter((item) => shouldCreateTask(item, existing.get(item.key), now, config.relevanceDays));
  const counts = { created: 0, updated: 0 };
  for (const item of wanted) {
    const result = await upsertTask(todoistToken, item, existing.get(item.key), taskPayload(item, relationships, config));
    if (result === "created" || result === "updated") counts[result] += 1;
  }
  console.log(`GitHub to Todoist sync complete. Created ${counts.created}, updated ${counts.updated}, considered ${wanted.length}.`);
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/")}`) {
  sync().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
