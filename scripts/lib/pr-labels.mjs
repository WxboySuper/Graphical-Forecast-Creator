import { descriptiveLabels } from './pr-label-content.mjs';
import { routingLabels } from './pr-label-routing.mjs';

export { MANAGED_LABELS } from './pr-label-managed.mjs';
export { routingLabels } from './pr-label-routing.mjs';
export { descriptiveLabels } from './pr-label-content.mjs';

/**
 * @param {{
 *   head: string;
 *   base: string;
 *   changedFiles: string[];
 *   mergeable: boolean | null;
 *   draft: boolean;
 *   changelogOk: boolean;
 * }} context
 * @returns {string[]}
 */
export const computePrLabels = ({ head, base, changedFiles, mergeable, draft, changelogOk }) => {
  const labels = new Set([
    ...routingLabels({ head, base }),
    ...descriptiveLabels({ changedFiles, head }),
  ]);

  if (mergeable === false) labels.add('has conflicts');
  if (draft) labels.add('draft');
  labels.add(changelogOk ? 'changelog:ok' : 'changelog:missing');

  return [...labels].sort();
};
