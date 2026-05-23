import { execFileSync } from 'node:child_process';

export const DEPENDENCIES_HEADING = '### Dependencies';
export const DEPENDENCIES_MARKER = '<!-- dependabot-automation -->';

const PACKAGE_JSON_PATHS = ['package.json', 'server/package.json'];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'];

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
    return sliceSectionBounds(changelog, unreleased, '## [Unreleased]'.length);
  }

  const match = changelog.match(/^## v[\d.]+/m);
  if (!match || match.index === undefined) return null;

  return sliceSectionBounds(changelog, match.index, match[0].length, match[0]);
};

/**
 * @param {string} changelog
 * @param {number} start
 * @param {number} headingLength
 * @param {string} [heading]
 */
const sliceSectionBounds = (changelog, start, headingLength, heading = '## [Unreleased]') => {
  const afterStart = start + headingLength;
  const rest = changelog.slice(afterStart);
  const next = rest.search(/\n## /);
  const end = next === -1 ? changelog.length : afterStart + next;
  return { heading, start, end };
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
 * @param {string} packagePath
 */
const readPackageJsonPairAtRefs = (baseRef, headRef, packagePath) => {
  try {
    return {
      base: JSON.parse(
        execFileSync('git', ['show', `origin/${baseRef}:${packagePath}`], { encoding: 'utf8' }),
      ),
      head: JSON.parse(
        execFileSync('git', ['show', `origin/${headRef}:${packagePath}`], { encoding: 'utf8' }),
      ),
      directory: packagePath === 'package.json' ? 'root' : 'server',
    };
  } catch {
    return null;
  }
};

/**
 * @param {Record<string, string>} baseDeps
 * @param {Record<string, string>} headDeps
 * @param {string} directory
 * @param {string} depType
 */
const bumpsForDependencyField = (baseDeps, headDeps, directory, depType) => {
  const bumps = [];
  for (const [name, to] of Object.entries(headDeps)) {
    const from = baseDeps[name];
    if (from !== undefined && from !== to) {
      bumps.push({ name, from, to, directory, depType });
    }
  }
  return bumps;
};

/**
 * @param {object} basePkg
 * @param {object} headPkg
 * @param {string} directory
 */
const collectBumpsFromPackagePair = (basePkg, headPkg, directory) =>
  DEPENDENCY_FIELDS.flatMap((depType) =>
    bumpsForDependencyField(basePkg[depType] ?? {}, headPkg[depType] ?? {}, directory, depType),
  );

/**
 * @param {string} baseRef
 * @param {string} headRef
 */
export const listDependencyBumpsBetweenRefs = (baseRef, headRef) =>
  PACKAGE_JSON_PATHS.flatMap((packagePath) => {
    const pair = readPackageJsonPairAtRefs(baseRef, headRef, packagePath);
    return pair ? collectBumpsFromPackagePair(pair.base, pair.head, pair.directory) : [];
  });

/**
 * @param {string} depsBody
 */
const parseDependencyLines = (depsBody) =>
  depsBody
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('- **') && line.includes(':**'));

/**
 * @param {string[]} lines
 * @param {Array<{ name: string; from: string; to: string; directory: string }>} bumps
 */
const mergeDependencyLines = (lines, bumps) => {
  const merged = [...lines];
  for (const bump of bumps) {
    const bullet = formatDependencyChangelogBullet(bump);
    const existingIndex = merged.findIndex((line) => dependencyBulletCoversPackage(line, bump.name));
    if (existingIndex === -1) merged.push(bullet);
    else if (!merged[existingIndex].includes(bump.to)) merged[existingIndex] = bullet;
  }
  return merged;
};

/**
 * @param {string[]} lines
 */
const formatDependenciesBlock = (lines) =>
  [DEPENDENCIES_HEADING, DEPENDENCIES_MARKER, '', ...lines, ''].join('\n');

/**
 * @param {string} sectionBody
 * @param {string} dependenciesBlock
 */
const replaceDependenciesBlock = (sectionBody, dependenciesBlock) => {
  const escapedHeading = DEPENDENCIES_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const depsPattern = new RegExp(`${escapedHeading}[\\s\\S]*?(?=\\n### |\\n## |$)`);
  const stripped = sectionBody.replace(depsPattern, '').trimEnd();
  const headingEnd = stripped.indexOf('\n');
  const insertPos = headingEnd === -1 ? stripped.length : headingEnd + 1;
  return `${stripped.slice(0, insertPos)}\n${dependenciesBlock}${stripped.slice(insertPos)}`;
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

  const lines = mergeDependencyLines(parseDependencyLines(existingDepsBody ?? ''), bumps);
  const sectionBody = replaceDependenciesBlock(
    changelog.slice(section.start, section.end),
    formatDependenciesBlock(lines),
  );

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
