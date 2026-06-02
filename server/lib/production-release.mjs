/**
 * Production release manifest: timed stage/promote deploys and alert banner derivation.
 * Used by CI validation, GitHub Actions, and VPS promote/cron scripts.
 */

const VALID_ACTIONS = new Set(['stage', 'live', 'promote', 'none']);
const VALID_STATUSES = new Set(['scheduled', 'staged', 'live', 'cancelled']);
const VALID_BANNER_TYPES = new Set(['info', 'warning', 'error']);
const ROLLOUT_MIN_LEAD_MS = 5 * 60 * 1000;
const ROLLOUT_MAX_FUTURE_MS = 90 * 24 * 60 * 60 * 1000;

/** @typedef {'info' | 'warning' | 'error'} BannerType */

/**
 * @typedef {object} BannerPhase
 * @property {string} [id]
 * @property {string} message
 * @property {BannerType} type
 * @property {boolean} [dismissible]
 * @property {string} [linkUrl]
 * @property {string} [linkLabel]
 * @property {string} [startsAt]
 * @property {string} [expiresAt]
 */

/**
 * @typedef {object} ProductionReleaseConfig
 * @property {string} releaseId
 * @property {string} version
 * @property {string} [rolloutAt]
 * @property {'stage' | 'live' | 'promote' | 'none'} action
 * @property {'scheduled' | 'staged' | 'live' | 'cancelled'} [status]
 * @property {{ phases?: BannerPhase[] }} [banner]
 * @property {string} [strategy]
 */

/**
 * @typedef {object} AlertBannerFile
 * @property {boolean} enabled
 * @property {string} message
 * @property {BannerType} type
 * @property {boolean} dismissible
 * @property {string} [id]
 * @property {string} [linkUrl]
 * @property {string} [linkLabel]
 * @property {string} [startsAt]
 * @property {string} [expiresAt]
 */

export const DEFAULT_PRODUCTION_RELEASE = {
  releaseId: 'baseline',
  version: '0.0.0',
  action: 'live',
  status: 'live',
};

/** @param {string | undefined} value */
export function parseInstant(value) {
  if (!value?.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** @param {string | undefined} startsAt @param {string | undefined} expiresAt @param {number} nowMs */
export function isWithinScheduleWindow(startsAt, expiresAt, nowMs) {
  const startsAtMs = parseInstant(startsAt);
  if (startsAtMs !== null && nowMs < startsAtMs) {
    return false;
  }
  const expiresAtMs = parseInstant(expiresAt);
  return expiresAtMs === null || nowMs < expiresAtMs;
}

/** @param {BannerPhase} phase @param {number} nowMs */
export function isBannerPhaseActive(phase, nowMs) {
  return isWithinScheduleWindow(phase.startsAt, phase.expiresAt, nowMs);
}

/** @param {BannerPhase[]} phases @param {number} nowMs */
export function resolveActiveBannerPhase(phases, nowMs = Date.now()) {
  if (!Array.isArray(phases)) {
    return null;
  }
  return phases.find((phase) => isBannerPhaseActive(phase, nowMs)) ?? null;
}

/** @param {BannerPhase} phase */
export function bannerPhaseToFlatConfig(phase) {
  return {
    enabled: true,
    message: phase.message,
    type: phase.type,
    dismissible: phase.dismissible !== false,
    id: phase.id,
    linkUrl: phase.linkUrl,
    linkLabel: phase.linkLabel,
    startsAt: phase.startsAt,
    expiresAt: phase.expiresAt,
  };
}

/**
 * Derives public/alert-banner.json payload.
 * @param {ProductionReleaseConfig} config
 * @param {{ nowMs?: number, surface?: 'live' | 'live-pre-promote' | 'all-phases' }} [options]
 */
export function deriveAlertBannerFile(config, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const surface = options.surface ?? 'live';
  const phases = config.banner?.phases;

  if (!phases?.length) {
    return { enabled: false, message: '', type: 'info', dismissible: true };
  }

  let candidatePhases = phases;

  if (surface === 'live-pre-promote') {
    const rolloutAtMs = parseInstant(config.rolloutAt);
    candidatePhases = phases.filter((phase) => {
      const phaseStart = parseInstant(phase.startsAt);
      const phaseEnd = parseInstant(phase.expiresAt);
      if (rolloutAtMs !== null && phaseEnd !== null && phaseEnd <= rolloutAtMs) {
        return true;
      }
      if (rolloutAtMs !== null && phaseStart !== null && phaseStart >= rolloutAtMs) {
        return false;
      }
      return isBannerPhaseActive(phase, nowMs);
    });
  }

  const active = resolveActiveBannerPhase(candidatePhases, nowMs);
  if (!active) {
    return { enabled: false, message: '', type: 'info', dismissible: true };
  }

  return bannerPhaseToFlatConfig(active);
}

/** @param {unknown} raw @param {string} key */
function readOptionalString(raw, key) {
  return typeof raw[key] === 'string' ? raw[key].trim() : undefined;
}

/** @param {unknown} data */
export function normalizeBannerPhase(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  const type = raw.type;
  const message = raw.message;
  if (typeof message !== 'string' || !message.trim()) {
    return null;
  }
  if (typeof type !== 'string' || !VALID_BANNER_TYPES.has(type)) {
    return null;
  }

  return {
    id: readOptionalString(raw, 'id'),
    message: message.trim(),
    type: /** @type {BannerType} */ (type),
    dismissible: raw.dismissible !== false,
    linkUrl: readOptionalString(raw, 'linkUrl'),
    linkLabel: readOptionalString(raw, 'linkLabel'),
    startsAt: readOptionalString(raw, 'startsAt'),
    expiresAt: readOptionalString(raw, 'expiresAt'),
  };
}

/** @param {unknown} data */
export function normalizeProductionReleaseConfig(data) {
  if (!data || typeof data !== 'object') {
    return { ...DEFAULT_PRODUCTION_RELEASE };
  }

  const raw = /** @type {Record<string, unknown>} */ (data);
  const action = raw.action;
  const status = raw.status;
  const phasesRaw = raw.banner && typeof raw.banner === 'object'
    ? /** @type {Record<string, unknown>} */ (raw.banner).phases
    : undefined;

  const phases = Array.isArray(phasesRaw)
    ? phasesRaw.map(normalizeBannerPhase).filter(Boolean)
    : undefined;

  return {
    releaseId: readOptionalString(raw, 'releaseId') || DEFAULT_PRODUCTION_RELEASE.releaseId,
    version: readOptionalString(raw, 'version') || DEFAULT_PRODUCTION_RELEASE.version,
    rolloutAt: readOptionalString(raw, 'rolloutAt'),
    action: typeof action === 'string' && VALID_ACTIONS.has(action) ? action : 'live',
    status:
      typeof status === 'string' && VALID_STATUSES.has(status) ? status : undefined,
    banner: phases?.length ? { phases } : undefined,
    strategy: readOptionalString(raw, 'strategy'),
  };
}

/**
 * @param {ProductionReleaseConfig} config
 * @param {number} nowMs
 * @returns {string[]}
 */
export function validateBannerPhases(config, nowMs = Date.now()) {
  const errors = [];
  const phases = config.banner?.phases ?? [];

  for (const [index, phase] of phases.entries()) {
    if (!phase.message.trim()) {
      errors.push(`banner.phases[${index}]: message is required`);
    }
    if (parseInstant(phase.startsAt) === null && phase.startsAt) {
      errors.push(`banner.phases[${index}]: invalid startsAt`);
    }
    if (parseInstant(phase.expiresAt) === null && phase.expiresAt) {
      errors.push(`banner.phases[${index}]: invalid expiresAt`);
    }
    const start = parseInstant(phase.startsAt);
    const end = parseInstant(phase.expiresAt);
    if (start !== null && end !== null && end <= start) {
      errors.push(`banner.phases[${index}]: expiresAt must be after startsAt`);
    }
  }

  const rolloutAtMs = parseInstant(config.rolloutAt);
  if (rolloutAtMs !== null && phases.length > 0) {
    const prePhases = phases.filter((p) => {
      const end = parseInstant(p.expiresAt);
      return end !== null && end <= rolloutAtMs;
    });
    const postPhases = phases.filter((p) => {
      const start = parseInstant(p.startsAt);
      return start !== null && start >= rolloutAtMs;
    });
    if (config.action === 'stage' && prePhases.length === 0) {
      errors.push('banner.phases: include at least one pre-rollout phase ending at or before rolloutAt');
    }
    if (config.action === 'stage' && postPhases.length === 0) {
      errors.push('banner.phases: include at least one post-rollout phase starting at or after rolloutAt');
    }
  }

  if (phases.length > 0 && !resolveActiveBannerPhase(phases, nowMs) && config.action !== 'stage') {
    // Non-fatal for stage deploys validating future schedules
  }

  return errors;
}

/**
 * @param {{
 *   config: ProductionReleaseConfig,
 *   packageVersion: string,
 *   deployAction?: string,
 *   nowMs?: number,
 *   force?: boolean,
 *   previousReleaseId?: string,
 * }} params
 */
export function validateProductionReleaseForDeploy({
  config,
  packageVersion,
  deployAction,
  nowMs = Date.now(),
  force = false,
  previousReleaseId,
}) {
  const errors = [];
  const action = deployAction || config.action;

  if (!config.releaseId?.trim()) {
    errors.push('releaseId is required');
  }

  if (!config.version?.trim()) {
    errors.push('version is required');
  } else if (config.version !== packageVersion) {
    errors.push(`version "${config.version}" must match package.json "${packageVersion}"`);
  }

  if (!VALID_ACTIONS.has(action)) {
    errors.push(`action "${action}" is not valid`);
  }

  if (action === 'stage') {
    const rolloutAtMs = parseInstant(config.rolloutAt);
    if (rolloutAtMs === null) {
      errors.push('rolloutAt is required for action "stage"');
    } else {
      if (rolloutAtMs <= nowMs + ROLLOUT_MIN_LEAD_MS) {
        errors.push('rolloutAt must be at least 5 minutes in the future for staging');
      }
      if (rolloutAtMs > nowMs + ROLLOUT_MAX_FUTURE_MS) {
        errors.push('rolloutAt is more than 90 days in the future');
      }
    }

    if (
      !force &&
      previousReleaseId &&
      previousReleaseId === config.releaseId &&
      config.status === 'staged'
    ) {
      errors.push(
        `releaseId "${config.releaseId}" is already staged; bump releaseId or use force deploy`,
      );
    }
  }

  if (action === 'live' && config.rolloutAt) {
    const rolloutAtMs = parseInstant(config.rolloutAt);
    if (rolloutAtMs !== null && rolloutAtMs > nowMs + ROLLOUT_MIN_LEAD_MS && config.status === 'scheduled') {
      errors.push(
        'action "live" is blocked while a future rollout is scheduled; use action "stage" or set action to live after promote',
      );
    }
  }

  errors.push(...validateBannerPhases(config, nowMs));

  return { ok: errors.length === 0, errors };
}

/** @param {string} version */
export function releaseDirectoryName(version) {
  return version.replace(/[^0-9A-Za-z.-]+/g, '_');
}
