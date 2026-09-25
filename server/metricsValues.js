/**
 * Server-side metric definitions and normalization helpers used by product
 * telemetry. The module constrains event names and maps events to aggregate
 * user fields stored by the metrics service.
 */
'use strict';

const crypto = require('crypto');

const METRIC_EVENT_TYPES = new Set([
  'account_signup', 'account_signin', 'cycle_saved', 'discussion_saved',
  'verification_run', 'cloud_cycle_saved', 'cloud_cycle_loaded',
]);
const BILLING_METRIC_EVENT_TYPES = new Set(['premium_upgrade', 'premium_cancellation']);
const ACTIVE_DAY_EVENT_TYPES = new Set([
  'cycle_saved', 'discussion_saved', 'verification_run', 'cloud_cycle_saved',
]);
const USER_METRIC_FIELDS = {
  cycle_saved: 'cyclesCreated',
  discussion_saved: 'discussionsWritten',
  verification_run: 'verificationSessionsRun',
  cloud_cycle_saved: 'cloudCyclesSaved',
};
const ADMIN_EVENT_FIELDS = {
  account_signup: 'signups',
  account_signin: 'signIns',
  cloud_cycle_saved: 'cloudSaves',
  cloud_cycle_loaded: 'cloudLoads',
  premium_upgrade: 'upgrades',
  premium_cancellation: 'cancellations',
};
const DEDUPE_TTL_DAYS = 35;

/** Returns today's day key in UTC for admin and user metric rollups. */
const getDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

/** Returns true when a string is one of the supported product-metric event types. */
const normalizeMetricEventType = (value) =>
  typeof value === 'string' && METRIC_EVENT_TYPES.has(value) ? value : null;

/** Returns true when a string is one of the supported billing-metric event types. */
const normalizeBillingMetricEventType = (value) =>
  typeof value === 'string' && BILLING_METRIC_EVENT_TYPES.has(value) ? value : null;

/** Returns a capped installation id only when the client provided a non-empty string. */
const readInstallationId = (value) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 256) : null;

/** Returns the UTC day key that immediately precedes the given current day key. */
const getPreviousDayKey = (dayKey) => {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return getDayKey(date);
};

/** Hashes the local installation id so admin dedupe docs never store the raw browser identifier. */
const hashInstallationId = (installationId) =>
  crypto
    .createHash('sha256')
    .update(`${process.env.METRICS_HASH_SALT || ''}:${installationId}`)
    .digest('hex');

/** Returns the Firestore document id for one daily dedupe record. */
const createDedupeDocId = (kind, dayKey, value) => `${kind}:${dayKey}:${value}`;

/** Returns the TTL timestamp for a new dedupe doc. */
const getDedupeExpiryDate = () => {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + DEDUPE_TTL_DAYS);
  return expiresAt;
};

/** Returns the default progress-first user metrics document shape. */
const getDefaultUserMetrics = (uid) => ({
  uid,
  activeDayStreak: 0,
  totalActiveDays: 0,
  cyclesCreated: 0,
  cloudCyclesSaved: 0,
  discussionsWritten: 0,
  verificationSessionsRun: 0,
  lastActiveDate: null,
  updatedAt: new Date(),
});

/** Returns the default aggregate admin metrics document shape. */
const getDefaultAdminDailyMetrics = () => ({
  activeDevices: 0,
  activeSignedInAccounts: 0,
  signups: 0,
  signIns: 0,
  premiumSubscriptions: 0,
  upgrades: 0,
  cancellations: 0,
  cloudSaves: 0,
  cloudLoads: 0,
  storageBytes: 0,
  updatedAt: new Date(),
});

/** Returns true when the daily metric event maps to one of the aggregate admin counters. */
const hasAdminEventField = (eventType) => Boolean(ADMIN_EVENT_FIELDS[eventType]);

/** Returns true when a live-summary value should overwrite the stored daily aggregate field. */
const shouldApplyLiveSummaryValue = (value) => typeof value === 'number';

/** Applies one boolean-gated increment to an existing numeric aggregate field. */
const incrementMetricField = (value, shouldIncrement) =>
  shouldIncrement ? Number(value || 0) + 1 : Number(value || 0);

/** Applies one event-mapped admin aggregate increment when the event has a tracked field. */
const applyAdminEventIncrement = (nextMetrics, eventType) => {
  const eventField = ADMIN_EVENT_FIELDS[eventType];
  if (!hasAdminEventField(eventType) || !eventField) {
    return nextMetrics;
  }

  return {
    ...nextMetrics,
    [eventField]: Number(nextMetrics[eventField] || 0) + 1,
  };
};

/** Applies optional live-summary values onto the next admin daily metrics payload. */
const applyLiveSummaryValues = (nextMetrics, { premiumSubscriptions, storageBytes }) => ({
  ...nextMetrics,
  ...(shouldApplyLiveSummaryValue(premiumSubscriptions)
    ? { premiumSubscriptions }
    : {}),
  ...(shouldApplyLiveSummaryValue(storageBytes) ? { storageBytes } : {}),
});

/** True when the event should advance the user's active-day streak and total active-day count. */
const countsAsActiveDay = (eventType) => ACTIVE_DAY_EVENT_TYPES.has(eventType);

/** Builds the next user metrics state for the incoming event without double-counting the same active day. */
const buildNextUserMetrics = ({ uid, existingData, eventType, dayKey }) => {
  const nextMetrics = {
    ...getDefaultUserMetrics(uid),
    ...existingData,
    uid,
    updatedAt: new Date(),
  };
  const counterField = USER_METRIC_FIELDS[eventType];

  if (counterField) {
    nextMetrics[counterField] = Number(nextMetrics[counterField] || 0) + 1;
  }

  if (!countsAsActiveDay(eventType)) {
    return nextMetrics;
  }

  if (nextMetrics.lastActiveDate === dayKey) {
    return nextMetrics;
  }

  nextMetrics.totalActiveDays = Number(nextMetrics.totalActiveDays || 0) + 1;
  nextMetrics.activeDayStreak =
    nextMetrics.lastActiveDate === getPreviousDayKey(dayKey)
      ? Number(nextMetrics.activeDayStreak || 0) + 1
      : 1;
  nextMetrics.lastActiveDate = dayKey;

  return nextMetrics;
};

/** Builds the next daily admin metrics state after applying dedupe wins and aggregate event increments. */
const buildNextAdminDailyMetrics = ({
  existingData,
  eventType,
  storageBytes,
  premiumSubscriptions,
  incrementActiveDevices,
  incrementActiveAccounts,
}) => {
  const nextMetrics = {
    ...getDefaultAdminDailyMetrics(),
    ...existingData,
    activeDevices: incrementMetricField(existingData?.activeDevices, incrementActiveDevices),
    activeSignedInAccounts: incrementMetricField(
      existingData?.activeSignedInAccounts,
      incrementActiveAccounts
    ),
    updatedAt: new Date(),
  };

  return applyLiveSummaryValues(
    applyAdminEventIncrement(nextMetrics, eventType),
    { premiumSubscriptions, storageBytes }
  );
};

/** Returns the latest-day snapshot fields that are shown as current admin headline values. */
const getLatestAdminSummaryValues = (latestMetrics, liveSummary) => ({
  totalAccounts: typeof liveSummary.totalAccounts === 'number' ? liveSummary.totalAccounts : 0,
  activeDevices: latestMetrics.activeDevices,
  activeSignedInAccounts: latestMetrics.activeSignedInAccounts,
  premiumSubscriptions: latestMetrics.premiumSubscriptions,
  storageBytes: latestMetrics.storageBytes,
});

/** Adds one day's rollup values into the requested window totals. */
const accumulateAdminWindowTotals = (totals, dayMetrics) => ({
  ...totals,
  signups: totals.signups + Number(dayMetrics.signups || 0),
  signIns: totals.signIns + Number(dayMetrics.signIns || 0),
  upgrades: totals.upgrades + Number(dayMetrics.upgrades || 0),
  cancellations: totals.cancellations + Number(dayMetrics.cancellations || 0),
  cloudSaves: totals.cloudSaves + Number(dayMetrics.cloudSaves || 0),
  cloudLoads: totals.cloudLoads + Number(dayMetrics.cloudLoads || 0),
});

module.exports = {
  getDayKey, normalizeMetricEventType, normalizeBillingMetricEventType, readInstallationId,
  getPreviousDayKey, hashInstallationId, createDedupeDocId, getDedupeExpiryDate,
  getDefaultUserMetrics, getDefaultAdminDailyMetrics, hasAdminEventField,
  shouldApplyLiveSummaryValue, incrementMetricField, applyAdminEventIncrement,
  applyLiveSummaryValues, countsAsActiveDay, buildNextUserMetrics, buildNextAdminDailyMetrics,
  getLatestAdminSummaryValues, accumulateAdminWindowTotals,
};
