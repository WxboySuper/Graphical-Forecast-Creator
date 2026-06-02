import { isWithinScheduleWindow, parseInstant } from './schedule.mjs';
import { VALID_BANNER_TYPES } from './constants.mjs';
import { sanitizeBannerLinkUrl } from './link-url.mjs';

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
    linkUrl: sanitizeBannerLinkUrl(phase.linkUrl),
    linkLabel: phase.linkLabel,
    startsAt: phase.startsAt,
    expiresAt: phase.expiresAt,
  };
}

/** @param {BannerPhase} phase @param {number | null} rolloutAtMs */
function isPreRolloutPhase(phase, rolloutAtMs) {
  const phaseEnd = parseInstant(phase.expiresAt);
  return rolloutAtMs !== null && phaseEnd !== null && phaseEnd <= rolloutAtMs;
}

/** @param {BannerPhase} phase @param {number | null} rolloutAtMs */
function isPostRolloutPhase(phase, rolloutAtMs) {
  const phaseStart = parseInstant(phase.startsAt);
  return rolloutAtMs !== null && phaseStart !== null && phaseStart >= rolloutAtMs;
}

/** @param {BannerPhase[]} phases @param {number | null} rolloutAtMs @param {number} nowMs */
function filterPrePromotePhases(phases, rolloutAtMs, nowMs) {
  return phases.filter((phase) => {
    if (isPreRolloutPhase(phase, rolloutAtMs)) {
      return true;
    }
    if (isPostRolloutPhase(phase, rolloutAtMs)) {
      return false;
    }
    return isBannerPhaseActive(phase, nowMs);
  });
}

const EMPTY_BANNER = { enabled: false, message: '', type: 'info', dismissible: true };

/**
 * @param {{ banner?: { phases?: BannerPhase[] }, rolloutAt?: string }} config
 * @param {{ nowMs?: number, surface?: 'live' | 'live-pre-promote' | 'all-phases' }} [options]
 */
export function deriveAlertBannerFile(config, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const surface = options.surface ?? 'live';
  const phases = config.banner?.phases;

  if (!phases?.length) {
    return EMPTY_BANNER;
  }

  const candidatePhases =
    surface === 'live-pre-promote'
      ? filterPrePromotePhases(phases, parseInstant(config.rolloutAt), nowMs)
      : phases;

  const active = resolveActiveBannerPhase(candidatePhases, nowMs);
  return active ? bannerPhaseToFlatConfig(active) : EMPTY_BANNER;
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
