/**
 * Backport rules: which stable lines a merged main PR is labelled for, what the backport branch and PR
 * look like, and which changelog declaration it carries. Pure functions; git and gh live in scripts/backport.mjs.
 */

export const BACKPORT_LABEL = /^backport-(\d+)\.x$/;
const IMPACT_LINE = /^Changelog-Impact:\s*(beta|hotfix|none)\s*$/im;
const REASON_LINE = /^Changelog-Reason:\s*(\S.*)$/im;

/** Lines such as "2.x" named by backport-2.x labels, in label order and without duplicates. */
export const linesFromLabels = (labels) => [...new Set(labels.map((label) => BACKPORT_LABEL.exec(label)?.[1]).filter(Boolean))].map((major) => `${major}.x`);

export const stableBranchForLine = (line) => `stable/${line}`;

export const backportBranch = (sourcePr, line) => `backport/${sourcePr}-to-${line}`;

/** Conventional-commit titles keep their type, so the backport reads like the original. */
export const backportTitle = (title, sourcePr, line) => `${title.replace(/\s*\(#\d+\)\s*$/, '')} (backport #${sourcePr} to ${line})`;

/**
 * A backport has its own changelog entry in the stable lane, drafted by the changelog bot, unless the
 * source PR waived changelog impact, in which case the waiver and its reason carry over.
 */
export const backportChangelogDeclaration = (sourceBody = '') => {
  const impact = IMPACT_LINE.exec(sourceBody)?.[1]?.toLowerCase();
  const reason = REASON_LINE.exec(sourceBody)?.[1]?.trim();
  if (impact === 'none' && reason) return `Changelog-Impact: none\nChangelog-Reason: ${reason}`;
  return 'Changelog-Impact: hotfix';
};

export const backportBody = ({ sourcePr, sourceUrl, line, sourceBody, conflicts }) => {
  const conflictNote = conflicts.length
    ? `\n## Conflicts to resolve\n\nThis cherry-pick did not apply cleanly. The conflicted files are committed with conflict markers so CI stays red until they are resolved on this branch:\n\n${conflicts.map((file) => `- \`${file}\``).join('\n')}\n\nResolve them, push, and mark this PR ready. If \`${line}\` needs a different fix than \`main\`, rewrite the change here.\n`
    : '';
  return `## Summary

Backport of [#${sourcePr}](${sourceUrl}) to \`${stableBranchForLine(line)}\`, cherry-picked from the \`main\` merge commit. \`CHANGELOG.md\` is not part of the pick: this PR has its own stable-lane entry.
${conflictNote}
${backportChangelogDeclaration(sourceBody)}

Backport of #${sourcePr}
`;
};
