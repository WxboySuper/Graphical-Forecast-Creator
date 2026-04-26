# AGENTS.md

## Operating Mode

This repo uses an agentic development workflow: inspect the codebase, make the smallest coherent change, verify it, and leave the workspace in a state a human can immediately continue from.

Agents should act like senior collaborators, not script runners. Prefer concrete progress over long proposals. When the user asks for an implementation, implement it. When the user reports a UI issue with screenshots, iterate directly against the actual behavior and verify the result.

## Core Principles

- Read the relevant code before changing it.
- Follow existing patterns before introducing new abstractions.
- Keep changes scoped to the requested behavior.
- Preserve unrelated worktree changes.
- Do not revert, reset, delete, or overwrite work you did not create unless explicitly asked.
- Prefer clear, testable fixes over broad rewrites.
- Make UI changes with the real user workflow in mind, not just the component in isolation.
- Treat mobile and responsive behavior as first-class product behavior.

## Git Rules

- Make code changes on a branch based on `beta` unless the user specifies another base or the workspace is already on a fresh task branch.
- If the current branch is not suitable for the requested change, create a new branch from `beta` before editing.
- Do not commit unless the user asks.
- Do not push unless the user asks.
- Do not open a pull request unless the user asks.
- It is fine to inspect git status and diffs while working.

## Implementation Workflow

1. Inspect the relevant files and existing tests.
2. Identify the smallest change that solves the reported problem.
3. Edit the implementation.
4. Add or update focused tests for the behavior.
5. Run targeted verification.
6. Run broader checks when the change touches shared behavior, build configuration, or user-facing flows.
7. Summarize what changed and what was verified.

If a test fails, fix the product code or the test based on the intended behavior. Do not weaken coverage just to make CI pass.

New feature work should include reasonable test coverage for the behavior that is easily testable. Keep changed files above 80% coverage, preferably higher when the code is important or easy to exercise.

## Frontend Expectations

- Build the actual usable experience, not a placeholder or marketing surface.
- Validate responsive layouts at realistic viewport sizes.
- For forecast editor work, verify both portrait and landscape phone layouts.
- Avoid horizontal page overflow.
- Avoid controls that require both vertical and horizontal scrolling in the same toolbar surface.
- Keep map workspace usable and visible on mobile.
- Keep touch targets large enough for phone use.
- Prefer CSS and existing component architecture before introducing mobile-only duplicates.
- If screenshots show overlap, clipping, unreachable controls, or awkward placement, treat that as a product bug.

## Forecast Editor Notes

The forecast editor is the highest-priority workflow. The map should remain the primary workspace, with toolbar controls adapting around it.

For mobile work, check:

- Navbar does not overflow.
- Map remains visible and usable.
- Floating map controls do not collide with the toolbar, legend, credits, or warning badge.
- Bottom toolbar tabs are reachable.
- Draw, Days, Layers, and Tools controls remain accessible.
- Legend/key can be hidden by default and opened intentionally.
- Landscape phone layout uses the mobile interaction model when height is constrained.

## Testing Guidance

Use the narrowest useful verification first, then broaden as risk increases.

Coverage matters. When adding features, update or add tests in the same change so behavior is protected and file coverage stays above 80%.

Common focused unit test command:

```powershell
pnpm test -- --runTestsByPath <test-file-1> <test-file-2>
```

Common build command:

```powershell
pnpm run build
```

Common Playwright command:

```powershell
pnpm exec playwright test e2e/smoke.spec.ts
```

When testing against an already-running local dev server:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3001'
$env:PLAYWRIGHT_SKIP_WEBSERVER='1'
pnpm exec playwright test e2e/smoke.spec.ts
```

## Communication

- Keep updates short and concrete while working.
- Tell the user what you changed and what passed.
- Call out any verification that could not be run.
- Mention unrelated dirty files only when they matter.
- Do not bury the result under process narration.
