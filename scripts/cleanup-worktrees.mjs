#!/usr/bin/env node
// cleanup-worktrees.mjs — lists stale worktrees for hygiene
// Usage: node scripts/cleanup-worktrees.mjs [--dry-run]
import { execSync } from "node:child_process";

const dryRun = process.argv.includes("--dry-run");

const out = execSync("git worktree list --porcelain", { encoding: "utf8" });
const worktrees = out.split("\n\n").map((block) => {
  const lines = block.split("\n");
  const path = lines.find((l) => l.startsWith("worktree "))?.replace("worktree ", "");
  const branch = lines.find((l) => l.startsWith("branch "))?.replace("branch refs/heads/", "");
  return { path, branch };
}).filter((w) => w.path);

console.log(`Found ${worktrees.length} worktrees:`);
for (const w of worktrees) {
  const isStale = w.branch?.startsWith("t3code/") || w.branch?.startsWith("gfc-ready-") || w.branch?.startsWith("gfc-review-");
  console.log(`- ${w.path} [${w.branch}] ${isStale ? "(stale)" : ""}`);
  if (isStale && !dryRun) {
    console.log(`  Would remove: git worktree remove ${w.path}`);
  }
}
if (dryRun) console.log("\nDry run — no changes made.");
