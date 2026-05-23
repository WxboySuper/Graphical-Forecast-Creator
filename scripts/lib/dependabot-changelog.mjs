import { execFileSync } from 'node:child_process';

export const DEPENDENCIES_HEADING = '### Dependencies';
export const DEPENDENCIES_MARKER = '<!-- dependabot-automation -->';

const PACKAGE_JSON_PATHS = ['package.json', 'server/package.json'];

/**
 * @param {string} directory
 */
export const packageDirectoryLabel = (directory) => {
  if (directory === 'root' || directory === '.' || directory === '') return 'root';
  return directory.replace(/\/$/, '');
};

/**
 * @param {string} changelog
 * @returns {{ heading: string; start: number; end: number } | null}
 */
export const findDependabotChangelogSection = (changelog) => {
  const unreleased = changelog.indexOf('## [Unreleased]');
  if (unreleased !== -1) {
    const afterStart = unreleased + '## [Unreleased]'.length;
    const rest = changelog.slice(afterStart);
    const next = rest.search(/\n## /);
    const end = next === -1 ? changelog.length : afterStart + next;
    return { heading: '## [Unreleased]', start: unreleased, end };
  }

  const match = changelog.match(/^## v[\d.]+/m);
  if (!match || match.index === undefined) return null;

  const afterStart = match.index + match[0].length;
  const rest = changelog.slice(afterStart);
  const next = rest.search(/\n## /);
  const end = next === -1 ? changelog.length : afterStart + next;
  return { heading: match[0], start: match.index, end };
};

/**
 * @param {string} changelog
 * @param {{ heading: string; start: number; end: number }} section
 * @returns {string | null}
 */
export const extractDependenciesSubsection = (changelog, section) => {
  const body = changelog.slice(section.start, section.end);
  const escapedHeading = DEPENDENCIES_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`${escapedHeading}[\\s\\S]*?(?=\\n### |\\n## |$)`));
  if (!match) return null;

  return match[0].slice(DEPENDENCIES_HEADING.length).replace(DEPENDENCIES_MARKER, '').trim();
};

/**
 * @param {{ name: string; from: string; to: string; directory: string }} bump
 */
export const formatDependencyChangelogBullet = ({ name, from, to, directory }) => {
  const scope =
    packageDirectoryLabel(directory) === 'root' ? '' : ` (\`${packageDirectoryLabel(directory)}\`)`;
  return `- **${name}:** ${from} → ${to}${scope}`;
};

/**
 * @param {string} line
 * @param {string} packageName
 */
export const dependencyBulletCoversPackage = (line, packageName) =>
  new RegExp(`\\*\\*${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*:`).test(line);

/**
 * @param {{ name: string; from: string; to: string; directory: string }} bump
 * @param {string} dependenciesBody
 */
export const dependencyBumpDocumented = (bump, dependenciesBody) => {
  if (!dependenciesBody.includes(`**${bump.name}:**`)) return false;
  return dependenciesBody.includes(bump.from) && dependenciesBody.includes(bump.to);
};

/**
 * @param {string} baseRef
 * @param {string} headRef
 * @returns {Array<{ name: string; from: string; to: string; directory: string; depType: string }>}
 */
export const listDependencyBumpsBetweenRefs = (baseRef, headRef) => {
  /** @type {Array<{ name: string; from: string; to: string; directory: string; depType: string }>} */
  const bumps = [];

  for (const packagePath of PACKAGE_JSON_PATHS) {
    let basePkg;
    let headPkg;
    try {
      basePkg = JSON.parse(
        execFileSync('git', ['show', `origin/${baseRef}:${packagePath}`], { encoding: 'utf8' }),
      );
      headPkg = JSON.parse(
        execFileSync('git', ['show', `origin/${headRef}:${packagePath}`], { encoding: 'utf8' }),
      );
    } catch {
      continue;
    }

    const directory = packagePath === 'package.json' ? 'root' : 'server';

    for (const depType of ['dependencies', 'devDependencies']) {
      const baseDeps = basePkg[depType] ?? {};
      const headDeps = headPkg[depType] ?? {};
      for (const [name, to] of Object.entries(headDeps)) {
        const from = baseDeps[name];
        if (from !== undefined && from !== to) {
          bumps.push({ name, from, to, directory, depType });
        }
      }
    }
  }

  return bumps;
};

/**
 * @param {string} changelog
 * @param {Array<{ name: string; from: string; to: string; directory: string }>} bumps
 */
export const applyDependencyBumpsToChangelog = (changelog, bumps) => {
  if (bumps.length === 0) return changelog;

  const section = findDependabotChangelogSection(changelog);
  if (!section) {
    throw new Error(
      'CHANGELOG.md must include ## [Unreleased] or a top ## vX.Y section for dependency entries.',
    );
  }

  const existingDepsBody = extractDependenciesSubsection(changelog, section);
  if (existingDepsBody && bumps.every((bump) => dependencyBumpDocumented(bump, existingDepsBody))) {
    return changelog;
  }

  const depsBody = existingDepsBody ?? '';
  const lines = depsBody
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('- **') && line.includes(':**'));

  for (const bump of bumps) {
    const bullet = formatDependencyChangelogBullet(bump);
    const existingIndex = lines.findIndex((line) => dependencyBulletCoversPackage(line, bump.name));
    if (existingIndex === -1) {
      lines.push(bullet);
    } else if (!lines[existingIndex].includes(bump.to)) {
      lines[existingIndex] = bullet;
    }
  }

  const dependenciesBlock = [
    DEPENDENCIES_HEADING,
    DEPENDENCIES_MARKER,
    '',
    ...lines,
    '',
  ].join('\n');

  let sectionBody = changelog.slice(section.start, section.end);
  const escapedHeading = DEPENDENCIES_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const depsPattern = new RegExp(`${escapedHeading}[\\s\\S]*?(?=\\n### |\\n## |$)`);
  sectionBody = sectionBody.replace(depsPattern, '').trimEnd();

  const headingEnd = sectionBody.indexOf('\n');
  const insertPos = headingEnd === -1 ? sectionBody.length : headingEnd + 1;
  sectionBody = `${sectionBody.slice(0, insertPos)}\n${dependenciesBlock}${sectionBody.slice(insertPos)}`;

  return changelog.slice(0, section.start) + sectionBody + changelog.slice(section.end);
};

/**
 * @param {string[]} changedFiles
 * @param {string} changelogAtHead
 * @param {Array<{ name: string; from: string; to: string; directory: string }>} bumps
 */
export const dependabotChangelogTouchesPr = (changedFiles, changelogAtHead, bumps) => {
  const touchesChangelog = changedFiles.some(
    (file) => file === 'CHANGELOG.md' || file.endsWith('/CHANGELOG.md'),
  );

  if (!touchesChangelog) {
    return {
      ok: false,
      reason:
        'Dependabot PRs must update CHANGELOG.md (the dependabot-changelog workflow commits ### Dependencies entries).',
    };
  }

  const section = findDependabotChangelogSection(changelogAtHead);
  if (!section) {
    return {
      ok: false,
      reason: 'CHANGELOG.md needs ## [Unreleased] or a top ## vX.Y section for ### Dependencies.',
    };
  }

  const depsBody = extractDependenciesSubsection(changelogAtHead, section);
  if (!depsBody || !/^-\s/m.test(depsBody)) {
    return {
      ok: false,
      reason: 'CHANGELOG.md ### Dependencies must list at least one dependency bump bullet.',
    };
  }

  const missing = bumps.filter((bump) => !dependencyBumpDocumented(bump, depsBody));
  if (missing.length > 0) {
    const names = missing.map((bump) => bump.name).join(', ');
    return {
      ok: false,
      reason: `CHANGELOG.md ### Dependencies is missing entries for: ${names}.`,
    };
  }

  return {
    ok: true,
    reason: 'CHANGELOG.md ### Dependencies documents this dependency bump.',
  };
};
