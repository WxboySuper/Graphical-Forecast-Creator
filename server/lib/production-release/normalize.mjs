import { DEFAULT_PRODUCTION_RELEASE, VALID_ACTIONS, VALID_STATUSES } from './constants.mjs';
import { normalizeBannerPhase } from './banner.mjs';

/** @param {unknown} raw @param {string} key */
function readOptionalString(raw, key) {
  return typeof raw[key] === 'string' ? raw[key].trim() : undefined;
}

/** @param {unknown} raw */
function readBannerPhases(raw) {
  if (!raw.banner || typeof raw.banner !== 'object') {
    return undefined;
  }
  const phasesRaw = /** @type {Record<string, unknown>} */ (raw.banner).phases;
  if (!Array.isArray(phasesRaw)) {
    return undefined;
  }
  const phases = phasesRaw.map(normalizeBannerPhase).filter(Boolean);
  return phases.length ? { phases } : undefined;
}

/** @param {unknown} data */
export function normalizeProductionReleaseConfig(data) {
  if (!data || typeof data !== 'object') {
    return { ...DEFAULT_PRODUCTION_RELEASE };
  }

  const raw = /** @type {Record<string, unknown>} */ (data);
  const action = raw.action;
  const status = raw.status;

  return {
    releaseId: readOptionalString(raw, 'releaseId') || DEFAULT_PRODUCTION_RELEASE.releaseId,
    version: readOptionalString(raw, 'version') || DEFAULT_PRODUCTION_RELEASE.version,
    rolloutAt: readOptionalString(raw, 'rolloutAt'),
    action: typeof action === 'string' && VALID_ACTIONS.has(action) ? action : 'live',
    status: typeof status === 'string' && VALID_STATUSES.has(status) ? status : undefined,
    banner: readBannerPhases(raw),
    strategy: readOptionalString(raw, 'strategy'),
  };
}
