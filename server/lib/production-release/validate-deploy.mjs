import { VALID_ACTIONS, ROLLOUT_MIN_LEAD_MS, ROLLOUT_MAX_FUTURE_MS } from './constants.mjs';
import { parseInstant } from './schedule.mjs';
import { validateBannerPhases } from './validate-phase.mjs';

/** @param {string} releaseId @param {string} packageVersion @param {import('./normalize.mjs').normalizeProductionReleaseConfig extends Function ? ReturnType<typeof import('./normalize.mjs').normalizeProductionReleaseConfig> : never} config */
function validateIdentity(releaseId, packageVersion, config, errors) {
  if (!releaseId?.trim()) {
    errors.push('releaseId is required');
  }
  if (!config.version?.trim()) {
    errors.push('version is required');
    return;
  }
  if (config.version !== packageVersion) {
    errors.push(`version "${config.version}" must match package.json "${packageVersion}"`);
  }
}

/** @param {import('./normalize.mjs').normalizeProductionReleaseConfig extends Function ? ReturnType<typeof import('./normalize.mjs').normalizeProductionReleaseConfig> : never} config @param {number} nowMs @param {string[]} errors */
function validateStageRolloutTime(config, nowMs, errors) {
  const rolloutAtMs = parseInstant(config.rolloutAt);
  if (rolloutAtMs === null) {
    errors.push('rolloutAt is required for action "stage"');
    return;
  }
  if (rolloutAtMs <= nowMs + ROLLOUT_MIN_LEAD_MS) {
    errors.push('rolloutAt must be at least 5 minutes in the future for staging');
  }
  if (rolloutAtMs > nowMs + ROLLOUT_MAX_FUTURE_MS) {
    errors.push('rolloutAt is more than 90 days in the future');
  }
}

/**
 * @param {{ releaseId: string, previousReleaseId?: string, previousVpsStatus?: string, force?: boolean }} params
 */
export function isDuplicateStageDeploy({ releaseId, previousReleaseId, previousVpsStatus, force }) {
  if (force) {
    return false;
  }
  if (!previousReleaseId || previousReleaseId !== releaseId) {
    return false;
  }
  return previousVpsStatus === 'staged' || previousVpsStatus === 'live';
}

/** @param {import('./normalize.mjs').normalizeProductionReleaseConfig extends Function ? ReturnType<typeof import('./normalize.mjs').normalizeProductionReleaseConfig> : never} config @param {number} nowMs @param {string[]} errors @param {{ force?: boolean, previousReleaseId?: string, previousVpsStatus?: string }} guards */
function validateStageAction(config, nowMs, errors, guards) {
  validateStageRolloutTime(config, nowMs, errors);
  if (isDuplicateStageDeploy({ releaseId: config.releaseId, ...guards })) {
    errors.push(
      `releaseId "${config.releaseId}" is already staged on the VPS; bump releaseId or use force deploy`,
    );
  }
}

/** @param {import('./normalize.mjs').normalizeProductionReleaseConfig extends Function ? ReturnType<typeof import('./normalize.mjs').normalizeProductionReleaseConfig> : never} config @param {number} nowMs @param {string[]} errors */
function validateLiveAction(config, nowMs, errors) {
  if (!config.rolloutAt) {
    return;
  }
  const rolloutAtMs = parseInstant(config.rolloutAt);
  if (rolloutAtMs === null) {
    return;
  }
  if (rolloutAtMs > nowMs + ROLLOUT_MIN_LEAD_MS && config.status === 'scheduled') {
    errors.push(
      'action "live" is blocked while a future rollout is scheduled; use action "stage" or set action to live after promote',
    );
  }
}

/**
 * @param {{
 *   config: ReturnType<typeof import('./normalize.mjs').normalizeProductionReleaseConfig>,
 *   packageVersion: string,
 *   deployAction?: string,
 *   nowMs?: number,
 *   force?: boolean,
 *   previousReleaseId?: string,
 *   previousVpsStatus?: string,
 * }} params
 */
export function validateProductionReleaseForDeploy({
  config,
  packageVersion,
  deployAction,
  nowMs = Date.now(),
  force = false,
  previousReleaseId,
  previousVpsStatus,
}) {
  const errors = [];
  const action = deployAction || config.action;

  validateIdentity(config.releaseId, packageVersion, config, errors);

  if (!VALID_ACTIONS.has(action)) {
    errors.push(`action "${action}" is not valid`);
  }

  const guards = { force, previousReleaseId, previousVpsStatus };
  if (action === 'stage') {
    validateStageAction(config, nowMs, errors, guards);
  }
  if (action === 'live') {
    validateLiveAction(config, nowMs, errors);
  }

  errors.push(...validateBannerPhases(config, nowMs));

  return { ok: errors.length === 0, errors };
}

/** @param {string} version */
export function releaseDirectoryName(version) {
  return version.replace(/[^0-9A-Za-z.-]+/g, '_');
}
