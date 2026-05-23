import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDependencyBumpsToChangelog,
  dependabotChangelogTouchesPr,
  extractDependenciesSubsection,
  findDependabotChangelogSection,
  formatDependencyChangelogBullet,
} from './dependabot-changelog.mjs';

const sampleChangelog = `# Changelog

## [Unreleased]

### Changed
- Something

## v1.5.3
`;

describe('dependabot changelog', () => {
  it('finds Unreleased as the active section', () => {
    const section = findDependabotChangelogSection(sampleChangelog);
    assert.equal(section?.heading, '## [Unreleased]');
  });

  it('inserts and updates dependency bullets', () => {
    const bump = {
      name: 'express-rate-limit',
      from: '^8.5.1',
      to: '^8.5.2',
      directory: 'server',
    };
    const updated = applyDependencyBumpsToChangelog(sampleChangelog, [bump]);
    const section = findDependabotChangelogSection(updated);
    assert.ok(section);
    const deps = extractDependenciesSubsection(updated, section);
    assert.match(deps ?? '', /express-rate-limit/);
    assert.match(deps ?? '', /\^8\.5\.2/);

    const updatedAgain = applyDependencyBumpsToChangelog(updated, [bump]);
    assert.equal(updatedAgain, updated);
  });

  it('validates dependabot changelog policy', () => {
    const bump = {
      name: 'postcss',
      from: '8.5.14',
      to: '8.5.15',
      directory: 'root',
    };
    const changelog = applyDependencyBumpsToChangelog(sampleChangelog, [bump]);
    const result = dependabotChangelogTouchesPr(['CHANGELOG.md'], changelog, [bump]);
    assert.equal(result.ok, true);
  });

  it('formats bullets with optional directory scope', () => {
    assert.equal(
      formatDependencyChangelogBullet({
        name: 'postcss',
        from: '8.5.14',
        to: '8.5.15',
        directory: 'root',
      }),
      '- **postcss:** 8.5.14 → 8.5.15',
    );
    assert.match(
      formatDependencyChangelogBullet({
        name: 'express-rate-limit',
        from: '^8.5.1',
        to: '^8.5.2',
        directory: 'server',
      }),
      /`server`/,
    );
  });
});
