const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const isSameRepository = (pull, { owner, repo }) =>
  pull.head?.repo?.full_name?.toLowerCase() === `${owner}/${repo}`.toLowerCase();

const hasTrustedAssociation = (pull) => TRUSTED_ASSOCIATIONS.has(pull.author_association);

const isAuditWorkerPull = (pull) =>
  pull.user?.login === 'github-actions[bot]' && pull.head?.ref?.startsWith('opencode/audit-');

const isDependabotPull = (pull) =>
  pull.user?.login === 'dependabot[bot]' && pull.head?.ref?.startsWith('dependabot/');

export function isEligibleFirstLookPull(pull, { owner, repo }) {
  return isSameRepository(pull, { owner, repo }) &&
    pull.draft !== true &&
    (hasTrustedAssociation(pull) || isAuditWorkerPull(pull) || isDependabotPull(pull));
}
