const MANAGED_START = '<!-- gfc-changelog-declaration -->';
const MANAGED_END = '<!-- end gfc-changelog-declaration -->';
const IMPACT_LINE = /^Changelog-Impact:\s*(?:beta|hotfix|none)\s*$/i;
const REASON_LINE = /^Changelog-Reason:\s*\S.*$/i;

/**
 * Builds the small metadata block maintained by GFC automation.
 * @param {{ impact: 'beta' | 'hotfix' | 'none'; reason?: string }} declaration
 */
export const formatManagedChangelogDeclaration = ({ impact, reason }) => {
  const lines = [MANAGED_START, `Changelog-Impact: ${impact}`];
  if (reason) lines.push(`Changelog-Reason: ${reason}`);
  lines.push(MANAGED_END);
  return lines.join('\n');
};

/**
 * Replaces automation's declaration without duplicating it on retries. Existing
 * user prose is preserved, while old declaration lines are removed so the
 * governance parser always sees exactly one declaration.
 * @param {string} body
 * @param {{ impact: 'beta' | 'hotfix' | 'none'; reason?: string }} declaration
 */
export const upsertManagedChangelogDeclaration = (body, declaration) => {
  const withoutManaged = String(body ?? '').replace(
    new RegExp(`${MANAGED_START}[\\s\\S]*?${MANAGED_END}\\s*`, 'gi'),
    '',
  );
  const withoutDeclarations = withoutManaged
    .split('\n')
    .filter((line) => !IMPACT_LINE.test(line.trim()) && !REASON_LINE.test(line.trim()))
    .join('\n')
    .trimEnd();

  return `${withoutDeclarations ? `${withoutDeclarations}\n\n` : ''}${formatManagedChangelogDeclaration(declaration)}\n`;
};
