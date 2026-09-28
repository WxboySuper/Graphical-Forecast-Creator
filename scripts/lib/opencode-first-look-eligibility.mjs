const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export function isEligibleFirstLookPull(pull, { owner, repo }) {
  const fullName = `${owner}/${repo}`;
  const sameRepository = pull.head?.repo?.full_name?.toLowerCase() === fullName.toLowerCase();
  const trustedAuthor = TRUSTED_ASSOCIATIONS.has(pull.author_association) ||
    (pull.user?.login === 'github-actions[bot]' && pull.head?.ref?.startsWith('opencode/audit-')) ||
    (pull.user?.login === 'dependabot[bot]' && pull.head?.ref?.startsWith('dependabot/'));

  return sameRepository && trustedAuthor && pull.draft !== true;
}
