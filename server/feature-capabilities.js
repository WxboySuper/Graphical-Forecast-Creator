'use strict';

const { getAdminDb } = require('./firebase-admin');

const CUSTOM_PRODUCTS_CAPABILITY = 'customProducts';

/** Keeps the server-owned Custom Products capability enabled after each hosted deploy. */
const ensureCustomProductsCapability = async ({ db = getAdminDb() } = {}) => {
  if (!db) {
    return { enabled: false, skipped: true };
  }

  await db
    .collection('serverFeatureCapabilities')
    .doc(CUSTOM_PRODUCTS_CAPABILITY)
    .set({ enabled: true }, { merge: true });

  return { enabled: true, skipped: false };
};

/**
 * Asserts the capability during boot without making startup depend on it.
 * The document is re-asserted on the next boot, so a transient Firestore
 * failure is logged and retried then instead of taking every route offline.
 */
const ensureCustomProductsCapabilityAtStartup = async ({ log = console, ...options } = {}) => {
  try {
    return await ensureCustomProductsCapability(options);
  } catch (error) {
    log.error?.('[capabilities] custom products capability write failed; continuing startup:', error);
    return { enabled: false, skipped: false, error };
  }
};

module.exports = {
  CUSTOM_PRODUCTS_CAPABILITY,
  ensureCustomProductsCapability,
  ensureCustomProductsCapabilityAtStartup,
};
