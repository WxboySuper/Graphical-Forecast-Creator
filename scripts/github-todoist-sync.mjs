#!/usr/bin/env node

const GITHUB_API = "https://api.github.com/graphql";
const TODOIST_API = "https://api.todoist.com/api/v1";
import { buildRelationships, parseMetadata, routeProjectId, shouldCreateTask, taskContent, taskDescription } from "./lib/github-todoist-sync-helpers.mjs";
export { buildRelationships, parseMetadata, routeProjectId, shouldCreateTask, taskContent, taskDescription } from "./lib/github-todoist-sync-helpers.mjs";

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

function parsePositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
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
