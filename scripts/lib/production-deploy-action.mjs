/**
 * Resolves the action requested by the production deploy workflow.
 *
 * @param {unknown} requestedAction
 * @param {unknown} manifestAction
 * @returns {string}
 */
export function resolveProductionDeployAction(requestedAction, manifestAction) {
  const normalizedRequest = normalizeProductionDeployAction(requestedAction);
  return normalizedRequest || String(manifestAction ?? '').trim() || 'live';
}

/**
 * Treats the workflow's auto option as no explicit override.
 *
 * @param {unknown} requestedAction
 * @returns {string}
 */
export function normalizeProductionDeployAction(requestedAction) {
  const normalizedAction = String(requestedAction ?? '').trim();
  return normalizedAction === 'auto' ? '' : normalizedAction;
}