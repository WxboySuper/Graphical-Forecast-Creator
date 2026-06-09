import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDependencyBumpsToChangelog,
  dependabotChangelogTouchesPr,
  extractDependenciesSubsection,
  findDependabotChangelogSection,
  formatDependencyChangelogBullet,
} from "./dependabot-changelog.mjs";

const sampleChangelog = `# Changelog

## [Unreleased]

### Changed
- Something

## v1.5.3
`;

describe("dependabot changelog", () => {
  it("finds Unreleased as the active section", () => {
    const section = findDependabotChangelogSection(sampleChangelog);
    assert.equal(section?.heading, "## [Unreleased]");
  });

  it("inserts and updates dependency bullets", () => {
    const bump = {
      name: "express-rate-limit",
      from: "^8.5.1",
      to: "^8.5.2",
      directory: "server",
    };
    const updated = applyDependencyBumpsToChangelog(sampleChangelog, [bump]);
    const section = findDependabotChangelogSection(updated);
    assert.ok(section);
    const deps = extractDependenciesSubsection(updated, section);
    assert.match(deps ?? "", /express-rate-limit/);
    assert.match(deps ?? "", /\^8\.5\.2/);

    const updatedAgain = applyDependencyBumpsToChangelog(updated, [bump]);
    assert.equal(updatedAgain, updated);
  });

  it("validates dependabot changelog policy", () => {
    const bump = {
      name: "postcss",
      from: "8.5.14",
      to: "8.5.15",
      directory: "root",
    };
    const changelog = applyDependencyBumpsToChangelog(sampleChangelog, [bump]);
    const result = dependabotChangelogTouchesPr(["CHANGELOG.md"], changelog, [
      bump,
    ]);
    assert.equal(result.ok, true);
  });

  it("keeps separate bullets when the same package bumps in root and server", () => {
    const bumps = [
      { name: "axios", from: "^1.7.0", to: "^1.7.9", directory: "root" },
      { name: "axios", from: "^1.7.0", to: "^1.7.9", directory: "server" },
    ];
    const updated = applyDependencyBumpsToChangelog(sampleChangelog, bumps);
    const section = findDependabotChangelogSection(updated);
    const deps = extractDependenciesSubsection(updated, section);
    assert.match(deps ?? "", /- \*\*axios:\*\* \^1\.7\.0 → \^1\.7\.9\n/u);
    assert.match(
      deps ?? "",
      /- \*\*axios:\*\* \^1\.7\.0 → \^1\.7\.9 \(`server`\)/u,
    );
    assert.equal(
      dependabotChangelogTouchesPr(["CHANGELOG.md"], updated, bumps).ok,
      true,
    );
  });

  it("does not treat another package line as documenting a different bump", () => {
    const changelog = applyDependencyBumpsToChangelog(sampleChangelog, [
      { name: "postcss", from: "8.5.14", to: "8.5.15", directory: "root" },
    ]);
    const undocumented = {
      name: "express-rate-limit",
      from: "^8.5.1",
      to: "^8.5.2",
      directory: "server",
    };
    const result = dependabotChangelogTouchesPr(["CHANGELOG.md"], changelog, [
      undocumented,
    ]);
    assert.equal(result.ok, false);
  });

  it("formats bullets with optional directory scope", () => {
    assert.equal(
      formatDependencyChangelogBullet({
        name: "postcss",
        from: "8.5.14",
        to: "8.5.15",
        directory: "root",
      }),
      "- **postcss:** 8.5.14 → 8.5.15",
    );
    assert.match(
      formatDependencyChangelogBullet({
        name: "express-rate-limit",
        from: "^8.5.1",
        to: "^8.5.2",
        directory: "server",
      }),
      /`server`/,
    );
  });

  it("finds Unreleased without brackets as the active section", () => {
    const changelog = `# Changelog

## Unreleased

### Changed
- Something

## v1.0.0
`;
    const section = findDependabotChangelogSection(changelog);
    assert.equal(section?.heading, "## Unreleased");
  });

  it("detects bumps documented in earlier version sections as duplicates", () => {
    const changelog = `# Changelog

## [Unreleased]

## v1.0.1

### Dependencies
<!-- dependabot-automation -->
- **lodash:** ^4.17.0 → ^4.17.21
`;
    const bump = {
      name: "lodash",
      from: "^4.17.0",
      to: "^4.17.21",
      directory: "root",
    };
    const result = applyDependencyBumpsToChangelog(changelog, [bump]);
    assert.equal(result, changelog);
  });

  it("puts new bumps under Unreleased even when a version section has Dependencies", () => {
    const changelog = `# Changelog

## Unreleased

## v1.0.0

### Dependencies
<!-- dependabot-automation -->
- **lodash:** ^4.17.0 → ^4.17.21
`;
    const bump = {
      name: "express",
      from: "^4.18.0",
      to: "^4.19.0",
      directory: "root",
    };
    const result = applyDependencyBumpsToChangelog(changelog, [bump]);
    const section = findDependabotChangelogSection(result);
    assert.equal(section?.heading, "## Unreleased");
    const deps = extractDependenciesSubsection(result, section);
    assert.match(deps ?? "", /express/);
    const versionSection = result.indexOf("## v1.0.0");
    const versionDeps = result.slice(versionSection);
    assert.ok(!versionDeps.includes("express"));
  });

  it("detects bumps documented in Unreleased as duplicates even when falling back to version section", () => {
    const changelog = `# Changelog

## Unreleased

### Dependencies
<!-- dependabot-automation -->
- **lodash:** ^4.17.0 → ^4.17.21

## v1.0.0
`;
    const bump = {
      name: "lodash",
      from: "^4.17.0",
      to: "^4.17.21",
      directory: "root",
    };
    const result = applyDependencyBumpsToChangelog(changelog, [bump]);
    assert.equal(result, changelog);
  });
});
