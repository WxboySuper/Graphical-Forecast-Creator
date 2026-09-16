import test from "node:test";
import assert from "node:assert/strict";
import { parseMetadata, routeProjectId, shouldCreateTask, taskContent, taskDescription } from "./github-todoist-sync.mjs";

const base = { key: "owner/repo:issue#12", number: 12, title: "Repair radar loading", url: "https://github.com/owner/repo/issues/12", type: "issue", state: "OPEN", labels: ["bug"], milestone: { title: "v1.8" } };

test("metadata is stable and parseable", () => {
  const description = taskDescription(base, { [base.key]: { closing: [], closedBy: [] } });
  assert.deepEqual(parseMetadata(description), { key: "owner/repo:issue#12", type: "issue" });
});

test("issue task names describe an action", () => {
  assert.equal(taskContent(base), "Fix issue #12: Repair radar loading");
});

test("PR task names use the required review format", () => {
  assert.equal(taskContent({ ...base, type: "pr", title: "Improve radar", number: 13 }), "Review PR #13 — Improve radar");
});

test("draft PRs do not create tasks, but existing tasks can still be updated", () => {
  const draft = { ...base, type: "pr", title: "WIP radar", number: 14, isDraft: true };
  assert.equal(shouldCreateTask(draft, undefined), false);
  assert.equal(shouldCreateTask(draft, { id: "existing" }), true);
});

test("routes labels and milestones before the default", () => {
  const config = { defaultProjectId: "maintenance", routes: [{ projectId: "v18", milestones: ["v1.8"] }, { projectId: "audit", labels: ["audit"] }] };
  assert.equal(routeProjectId(base, config), "v18");
  assert.equal(routeProjectId({ ...base, milestone: null, labels: ["audit"] }, config), "audit");
  assert.equal(routeProjectId({ ...base, milestone: null, labels: [] }, config), "maintenance");
});
