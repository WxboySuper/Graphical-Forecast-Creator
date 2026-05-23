/** @typedef {{ head: string; base: string }} RoutingContext */

/** @type {Array<[prefix: string, label: string]>} */
const BRANCH_KIND_LABELS = [
  ['feature/', 'feature'],
  ['fix/', 'fix'],
  ['hotfix/', 'hotfix'],
  ['release/', 'release'],
  ['port/', 'port'],
  ['refactor/', 'refactor'],
];

/**
 * @param {string} head
 * @returns {Set<string>}
 */
const branchKindLabels = (head) => {
  const labels = new Set();
  for (const [prefix, label] of BRANCH_KIND_LABELS) {
    if (head.startsWith(prefix)) labels.add(label);
  }
  return labels;
};

/**
 * @param {string} head
 * @returns {Set<string>}
 */
const betaIntegrationLabels = (head) => {
  const labels = new Set();
  if (head.startsWith('hotfix/')) return labels;
  if (head.startsWith('feature/') || head.startsWith('fix/')) {
    labels.add('integration:primary');
    return labels;
  }
  if (head !== 'beta' && !head.startsWith('port/')) {
    labels.add('integration:other');
  }
  return labels;
};

/**
 * Branch routing and integration priority labels.
 *
 * @param {RoutingContext} context
 * @returns {Set<string>}
 */
export const routingLabels = ({ head, base }) => {
  const labels = branchKindLabels(head);
  if (head === 'beta' && base === 'main') labels.add('promotion');
  if (base === 'beta') {
    for (const label of betaIntegrationLabels(head)) labels.add(label);
  }
  return labels;
};
