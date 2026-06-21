/**
 * Deterministic feature exposure policy evaluation.
 *
 * Pure-JS validation that runs in CI without TypeScript compilation.
 * The CI entry point (validate-feature-exposure.mjs) extracts registry
 * and surface data from source files, then passes it here.
 */

/**
 * @typedef {{ ok: true }} PolicyOk
 * @typedef {{ ok: false, errors: string[] }} PolicyFail
 * @typedef {PolicyOk | PolicyFail} PolicyResult
 */

const BUILD_TARGET_LIST = ['local', 'beta', 'staging', 'production'];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Returns true when addedDate is a real YYYY-MM-DD calendar value. */
function isValidIsoCalendarDate(addedDate) {
  if (!ISO_DATE_PATTERN.test(addedDate)) return false;
  const [year, month, day] = addedDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Validates the feature exposure registry and cross-file surface references.
 *
 * @param {Record<string, any>} registry — the FEATURE_EXPOSURE_REGISTRY
 * @param {{ gatedRoutes: { feature: string }[], navigationItems: { feature?: string }[] }} surfaces
 * @param {string[]} [serverCapabilityKeys] — known server capability keys
 * @returns {PolicyResult}
 */
export function evaluateFeatureExposurePolicy(registry, surfaces, serverCapabilityKeys = []) {
  const errors = [];

  // ── 1. Registry metadata integrity ──────────────────────────────
  for (const [featureKey, definition] of Object.entries(registry)) {
    // Exposure matrix must cover all build targets
    for (const target of BUILD_TARGET_LIST) {
      if (typeof definition.exposure?.[target] !== 'boolean') {
        errors.push(
          `Feature "${featureKey}" is missing exposure for target "${target}".`
        );
      }
    }

    // addedDate must be a valid ISO calendar date
    if (!isValidIsoCalendarDate(definition.addedDate)) {
      errors.push(
        `Feature "${featureKey}" has an invalid addedDate ${JSON.stringify(definition.addedDate)}.`
      );
    }

    // Temporary features must declare a removalCondition
    if (definition.temporary && (!definition.removalCondition || definition.removalCondition.trim().length === 0)) {
      errors.push(
        `Temporary feature "${featureKey}" must declare a removalCondition.`
      );
    }

    // Server-backed features must have a capability key
    if (definition.serverBacked && !definition.serverCapabilityKey?.trim()) {
      errors.push(
        `Server-backed feature "${featureKey}" must declare serverCapabilityKey.`
      );
    }

    // Non-server-backed features must not have a capability key
    if (!definition.serverBacked && definition.serverCapabilityKey) {
      errors.push(
        `Feature "${featureKey}" must not declare serverCapabilityKey when serverBacked is false.`
      );
    }

    // Every feature must have a tracking issue
    if (typeof definition.trackingIssue !== 'number' || definition.trackingIssue <= 0) {
      errors.push(
        `Feature "${featureKey}" must declare a positive trackingIssue number.`
      );
    }
  }

  // ── 2. Unknown surface key detection ────────────────────────────
  const registryKeys = new Set(Object.keys(registry));

  const gatedRouteFeatures = surfaces.gatedRoutes.map((r) => r.feature);
  const navigationFeatures = surfaces.navigationItems
    .map((item) => item.feature)
    .filter(Boolean);
  const allSurfaceFeatures = [...new Set([...gatedRouteFeatures, ...navigationFeatures])];

  for (const featureKey of allSurfaceFeatures) {
    if (!registryKeys.has(featureKey)) {
      errors.push(
        `Surface feature "${featureKey}" is referenced in routes/navigation but does not exist in the feature exposure registry.`
      );
    }
  }

  // ── 3. Server capability alignment ──────────────────────────────
  const serverBackedFeatures = Object.entries(registry).filter(
    ([, def]) => def.serverBacked
  );

  for (const [featureKey, definition] of serverBackedFeatures) {
    if (!definition.serverCapabilityKey) {
      // Already caught by metadata check above, but be explicit
      continue;
    }

    if (!serverCapabilityKeys.includes(definition.serverCapabilityKey)) {
      errors.push(
        `Feature "${featureKey}" declares serverCapabilityKey "${definition.serverCapabilityKey}" but it is not in the server capability keys list.`
      );
    }
  }

  // ── 4. Production safety ────────────────────────────────────────
  // Only flag temporary (in-development) features exposed on production.
  // Permanent features are expected to be on in all targets.
  for (const [featureKey, definition] of Object.entries(registry)) {
    if (definition.temporary && definition.exposure?.production === true) {
      errors.push(
        `Temporary feature "${featureKey}" is exposed on production. Temporary features must not be enabled on production until explicitly promoted.`
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}
