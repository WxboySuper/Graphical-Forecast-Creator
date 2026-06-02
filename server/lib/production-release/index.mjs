/**
 * Production release manifest: timed stage/promote deploys and alert banner derivation.
 */

export {
  DEFAULT_PRODUCTION_RELEASE,
  VALID_ACTIONS,
  VALID_STATUSES,
  ROLLOUT_MIN_LEAD_MS,
  ROLLOUT_MAX_FUTURE_MS,
} from './constants.mjs';

export { parseInstant, isWithinScheduleWindow } from './schedule.mjs';
export { isSafeBannerLinkUrl, sanitizeBannerLinkUrl } from './link-url.mjs';

export {
  isBannerPhaseActive,
  resolveActiveBannerPhase,
  bannerPhaseToFlatConfig,
  deriveAlertBannerFile,
  normalizeBannerPhase,
} from './banner.mjs';

export { normalizeProductionReleaseConfig } from './normalize.mjs';
export { validateBannerPhases } from './validate-phase.mjs';

export {
  validateProductionReleaseForDeploy,
  isDuplicateStageDeploy,
  releaseDirectoryName,
} from './validate-deploy.mjs';
