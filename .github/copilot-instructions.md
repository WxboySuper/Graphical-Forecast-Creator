# Graphical Forecast Creator (GFC) - Development Instructions

## 🛠️ Core Directives
2. **Process over Code**: Prioritize maintaining the development workflow and documentation standards over specific implementation details, as the codebase is dynamic.
3. **Pnpm First**: This project uses `pnpm`. Never use `npm` or `yarn` for dependency management.

## 🌿 Branching & Workflow
*   **Main Branch**: Production-ready code. Only merged from `beta`.
*   **Beta Branch**: Staging and integration. All features and bugfixes must pass through `beta` before `main`.
*   **Feature Branches**: `feature/[name-of-feature]` (e.g., `feature/discussion-editor-v2`).
*   **Bugfix Branches**: `fix/[bug-description]` (e.g., `fix/map-flicker`).
*   **Hotfix Branches**: `hotfix/[critical-fix]` (targeted at `main`).
*   **Automated Porting**: When a PR is merged into `main` or `beta`, the system will automatically create porting PRs to propagate changes down the branch hierarchy.

## 📝 Commit Message Conventions
Use [Conventional Commits](https://www.conventionalcommits.org/):
*   `feat:` New features.
*   `fix:` Bug fixes.
*   `chore:` Maintenance, dependency updates, configuration.
*   `docs:` Documentation changes.
*   `style:` Formatting, missing semi-colons, etc. (no code changes).
*   `refactor:` Code changes that neither fix a bug nor add a feature.

**Example**: `feat(map): add support for high-resolution CWA boundaries`

## 📖 Change Documentation
### 1. CHANGELOG.md
Every user-facing change must be recorded in [CHANGELOG.md](../CHANGELOG.md) under the `[Unreleased]` or current version section using these categories:
*   `Added`: For new features.
*   `Changed`: For changes in existing functionality.
*   `Deprecated`: For soon-to-be removed features.
*   `Removed`: For now-removed features.
*   `Fixed`: For any bug fixes.
*   `Security`: In case of vulnerabilities.

### 2. Update Notes
When structural changes (schema migrations, API changes, new store slices) occur:
*   Document the "Why" and "How to migrate" in the relevant doc file within `docs/`.
*   Update `ROADMAP.md` if a milestone is reached.

## 🏗️ Development Process
1.  **Exploration**: Always check `package.json` and existing hooks/utils before reinventing logic.
2.  **Implementation**: 
    *   Use functional components with TypeScript.
    *   State management via Redux Toolkit (`src/store`).
    *   Styling via Tailwind CSS (v3).
3.  **Validation**:
    *   Verify builds with `pnpm run build` (uses `cross-env` for stability).
    *   Check for security vulnerabilities with `pnpm audit`.
4.  **Handoff**: After implementing changes, summarize what was done and which documentation (Changelog/Roadmap) was updated. Always remind the user to review and commit.
