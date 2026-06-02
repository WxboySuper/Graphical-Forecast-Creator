import { parseInstant } from './schedule.mjs';
import { isSafeBannerLinkUrl } from './link-url.mjs';

/** @param {string | undefined} value */
function hasInvalidInstant(value) {
  return Boolean(value?.trim()) && parseInstant(value) === null;
}

/** @param {import('./banner.mjs').BannerPhase} phase @param {number} index */
function validatePhaseMessageAndLink(phase, index) {
  const errors = [];
  if (!phase.message.trim()) {
    errors.push(`banner.phases[${index}]: message is required`);
  }
  const linkUrl = phase.linkUrl?.trim();
  if (linkUrl && !isSafeBannerLinkUrl(linkUrl)) {
    errors.push(`banner.phases[${index}]: linkUrl must be a path or http(s) URL`);
  }
  return errors;
}

/** @param {import('./banner.mjs').BannerPhase} phase @param {number} index */
function validatePhaseSchedule(phase, index) {
  const errors = [];
  if (hasInvalidInstant(phase.startsAt)) {
    errors.push(`banner.phases[${index}]: invalid startsAt`);
  }
  if (hasInvalidInstant(phase.expiresAt)) {
    errors.push(`banner.phases[${index}]: invalid expiresAt`);
  }
  const start = parseInstant(phase.startsAt);
  const end = parseInstant(phase.expiresAt);
  if (start !== null && end !== null && end <= start) {
    errors.push(`banner.phases[${index}]: expiresAt must be after startsAt`);
  }
  return errors;
}

/** @param {import('./banner.mjs').BannerPhase} phase @param {number} index */
function validatePhaseFields(phase, index) {
  return [...validatePhaseMessageAndLink(phase, index), ...validatePhaseSchedule(phase, index)];
}

/** @param {import('./banner.mjs').BannerPhase} phase @param {number} rolloutAtMs */
function isPreRolloutPhase(phase, rolloutAtMs) {
  const end = parseInstant(phase.expiresAt);
  return end !== null && end <= rolloutAtMs;
}

/** @param {import('./banner.mjs').BannerPhase} phase @param {number} rolloutAtMs */
function isPostRolloutPhase(phase, rolloutAtMs) {
  const start = parseInstant(phase.startsAt);
  return start !== null && start >= rolloutAtMs;
}

/** @param {import('./banner.mjs').BannerPhase[]} phases @param {number} rolloutAtMs @param {string | undefined} action */
function validateRolloutPhaseCoverage(phases, rolloutAtMs, action) {
  if (action !== 'stage') {
    return [];
  }
  const hasPre = phases.some((phase) => isPreRolloutPhase(phase, rolloutAtMs));
  const hasPost = phases.some((phase) => isPostRolloutPhase(phase, rolloutAtMs));
  const errors = [];
  if (!hasPre) {
    errors.push('banner.phases: include at least one pre-rollout phase ending at or before rolloutAt');
  }
  if (!hasPost) {
    errors.push('banner.phases: include at least one post-rollout phase starting at or after rolloutAt');
  }
  return errors;
}

/** @param {{ banner?: { phases?: import('./banner.mjs').BannerPhase[] }, rolloutAt?: string, action?: string }} config */
function bannerCoverageErrors(config) {
  const phases = config.banner?.phases ?? [];
  const rolloutAtMs = parseInstant(config.rolloutAt);
  if (rolloutAtMs === null || phases.length === 0) {
    return [];
  }
  return validateRolloutPhaseCoverage(phases, rolloutAtMs, config.action);
}

/**
 * @param {{ banner?: { phases?: import('./banner.mjs').BannerPhase[] }, rolloutAt?: string, action?: string }} config
 */
export function validateBannerPhases(config) {
  const phases = config.banner?.phases ?? [];
  const fieldErrors = phases.flatMap((phase, index) => validatePhaseFields(phase, index));
  return [...fieldErrors, ...bannerCoverageErrors(config)];
}
