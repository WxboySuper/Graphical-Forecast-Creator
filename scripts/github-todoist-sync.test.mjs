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

test("only recent ready work creates tasks, while existing tasks remain updateable", () => {
  const draft = { ...base, type: "pr", title: "WIP radar", number: 14, isDraft: true };
  assert.equal(shouldCreateTask({ ...draft, updatedAt: "2026-09-15T00:00:00Z" }, undefined, Date.parse("2026-09-16T00:00:00Z")), false);
  assert.equal(shouldCreateTask({ ...base, updatedAt: "2026-09-15T00:00:00Z" }, undefined, Date.parse("2026-09-16T00:00:00Z")), true);
  assert.equal(shouldCreateTask({ ...base, state: "CLOSED", updatedAt: "2020-01-01T00:00:00Z" }, { id: "existing" }), true);
  assert.equal(shouldCreateTask({ ...base, updatedAt: "2020-01-01T00:00:00Z" }, undefined, Date.parse("2026-09-16T00:00:00Z")), false);
});

test("routes labels and milestones before the default", () => {
  const config = { defaultProjectId: "maintenance", routes: [{ projectId: "v18", milestones: ["v1.8"] }, { projectId: "audit", labels: ["audit"] }] };
  assert.equal(routeProjectId(base, config), "v18");
  assert.equal(routeProjectId({ ...base, milestone: null, labels: ["audit"] }, config), "audit");
  assert.equal(routeProjectId({ ...base, milestone: null, labels: [] }, config), "maintenance");
});
