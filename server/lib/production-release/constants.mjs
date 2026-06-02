export const VALID_ACTIONS = new Set(['stage', 'live', 'promote', 'none']);
export const VALID_STATUSES = new Set(['scheduled', 'staged', 'live', 'cancelled']);
export const VALID_BANNER_TYPES = new Set(['info', 'warning', 'error']);
export const ROLLOUT_MIN_LEAD_MS = 5 * 60 * 1000;
export const ROLLOUT_MAX_FUTURE_MS = 90 * 24 * 60 * 60 * 1000;

export const DEFAULT_PRODUCTION_RELEASE = {
  releaseId: 'baseline',
  version: '0.0.0',
  action: 'live',
  status: 'live',
};
