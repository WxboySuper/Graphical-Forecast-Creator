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
