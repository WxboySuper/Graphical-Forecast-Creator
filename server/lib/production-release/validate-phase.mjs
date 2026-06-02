import { parseInstant } from './schedule.mjs';
import { resolveActiveBannerPhase } from './banner.mjs';

/** @param {import('./banner.mjs').BannerPhase} phase @param {number} index */
function validatePhaseFields(phase, index) {
  const errors = [];
  if (!phase.message.trim()) {
    errors.push(`banner.phases[${index}]: message is required`);
  }
  if (phase.startsAt && parseInstant(phase.startsAt) === null) {
    errors.push(`banner.phases[${index}]: invalid startsAt`);
  }
  if (phase.expiresAt && parseInstant(phase.expiresAt) === null) {
    errors.push(`banner.phases[${index}]: invalid expiresAt`);
  }
  const start = parseInstant(phase.startsAt);
  const end = parseInstant(phase.expiresAt);
  if (start !== null && end !== null && end <= start) {
    errors.push(`banner.phases[${index}]: expiresAt must be after startsAt`);
  }
  return errors;
}

/** @param {import('./banner.mjs').BannerPhase[]} phases @param {number} rolloutAtMs */
function validateRolloutPhaseCoverage(phases, rolloutAtMs, action) {
  if (action !== 'stage') {
    return [];
  }
  const prePhases = phases.filter((p) => {
    const end = parseInstant(p.expiresAt);
    return end !== null && end <= rolloutAtMs;
  });
  const postPhases = phases.filter((p) => {
    const start = parseInstant(p.startsAt);
    return start !== null && start >= rolloutAtMs;
  });
  const errors = [];
  if (prePhases.length === 0) {
    errors.push('banner.phases: include at least one pre-rollout phase ending at or before rolloutAt');
  }
  if (postPhases.length === 0) {
    errors.push('banner.phases: include at least one post-rollout phase starting at or after rolloutAt');
  }
  return errors;
}

/**
 * @param {{ banner?: { phases?: import('./banner.mjs').BannerPhase[] }, rolloutAt?: string, action?: string }} config
 * @param {number} nowMs
 */
export function validateBannerPhases(config, nowMs = Date.now()) {
  const phases = config.banner?.phases ?? [];
  const fieldErrors = phases.flatMap((phase, index) => validatePhaseFields(phase, index));

  const rolloutAtMs = parseInstant(config.rolloutAt);
  const coverageErrors =
    rolloutAtMs !== null && phases.length > 0
      ? validateRolloutPhaseCoverage(phases, rolloutAtMs, config.action)
      : [];

  if (phases.length > 0 && !resolveActiveBannerPhase(phases, nowMs) && config.action !== 'stage') {
    // Non-fatal for stage deploys validating future schedules.
  }

  return [...fieldErrors, ...coverageErrors];
}
