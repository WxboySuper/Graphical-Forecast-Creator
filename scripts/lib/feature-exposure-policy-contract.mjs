/** Returns repository-relative paths checked for per-feature exposure tests. */
export const PER_FEATURE_TEST_PATTERNS = (featureKey) => [
  `src/features/${featureKey}.test.tsx`,
  `src/features/${featureKey}.test.ts`,
  `src/features/${featureKey}/${featureKey}.test.tsx`,
  `src/features/${featureKey}/${featureKey}.test.ts`,
  `src/features/${featureKey}.exposure.test.tsx`,
  `src/features/${featureKey}.exposure.test.ts`,
  `src/features/${featureKey}/${featureKey}.exposure.test.tsx`,
  `src/features/${featureKey}/${featureKey}.exposure.test.ts`,
];

/** Collects every feature key that is gated by routes, navigation, or side effects. */
export function collectGatedFeatures(surfaces, sideEffectModules) {
  return new Set([
    ...surfaces.gatedRoutes.map(({ feature }) => feature),
    ...surfaces.navigationItems.map(({ feature }) => feature).filter(Boolean),
    ...Object.keys(sideEffectModules),
  ]);
}

/** Returns true when a gated feature has a per-feature test file on disk. */
function hasPerFeatureTestFile(featureKey, existingTestFiles) {
  return PER_FEATURE_TEST_PATTERNS(featureKey).some((pattern) => existingTestFiles.includes(pattern));
}

/** Returns true when an acknowledgement entry has a non-empty reason. */
function hasValidAcknowledgementReason(acknowledgement) {
  return typeof acknowledgement?.reason === 'string' && acknowledgement.reason.trim().length > 0;
}

/** Returns true when an acknowledgement entry has a positive tracking issue. */
function hasValidAcknowledgementTrackingIssue(acknowledgement) {
  return typeof acknowledgement?.trackingIssue === 'number' && acknowledgement.trackingIssue > 0;
}

/** Canonical v1.7 workstream keys — keep aligned with featureExposure.test.ts and v17WorkstreamAdoption.exposure.test.ts */
export const V17_WORKSTREAM_KEYS = [
  'autoTstm',
  'forecastWorkflowV2',
  'verificationRelaunch',
  'customProducts',
  'tropicalWorkspace',
  'collaborationRoom',
];

const V17_BUILD_TARGETS = ['local', 'beta', 'staging', 'production'];

/** Returns true when the registry includes the full v1.7 workstream key set. */
function hasCompleteV17WorkstreamRegistry(registry) {
  const presentKeys = V17_WORKSTREAM_KEYS.filter((featureKey) => featureKey in registry);
  if (presentKeys.length === 0) {
    return false;
  }

  return presentKeys.length === V17_WORKSTREAM_KEYS.length;
}

/** Adds an error when the registry declares only part of the v1.7 workstream key set. */
function validateV17RegistryCompleteness(registry, errors) {
  if (!hasCompleteV17WorkstreamRegistry(registry)) {
    const presentCount = V17_WORKSTREAM_KEYS.filter((featureKey) => featureKey in registry).length;
    if (presentCount > 0) {
      errors.push(
        `Registry declares ${presentCount} of ${V17_WORKSTREAM_KEYS.length} v1.7 workstream keys; partial adoption is not allowed.`
      );
    }
    return false;
  }

  return true;
}

/** Adds lifecycle violations for one v1.7 workstream registry entry. */
function validateV17WorkstreamLifecycle(featureKey, definition, errors) {
  if (definition.temporary !== true) {
    errors.push(`v1.7 workstream "${featureKey}" must remain temporary until production promotion.`);
  }

  for (const target of V17_BUILD_TARGETS) {
    if (definition.exposure?.[target] !== false) {
      errors.push(
        `v1.7 workstream "${featureKey}" must stay disabled on target "${target}" until adoption enables it.`
      );
    }
  }
}

/** Returns true when a v1.7 workstream has per-feature tests or a valid acknowledgement. */
function hasV17WorkstreamCoverage(featureKey, contract) {
  const { acknowledgements, existingTestFiles } = contract;
  if (hasPerFeatureTestFile(featureKey, existingTestFiles)) {
    return true;
  }

  return hasValidAcknowledgement(featureKey, acknowledgements);
}

/** Adds coverage violations for one v1.7 workstream registry entry. */
function validateV17WorkstreamCoverage(featureKey, gatedFeatures, contract, errors) {
  if (hasV17WorkstreamCoverage(featureKey, contract)) {
    return;
  }

  if (gatedFeatures.has(featureKey)) {
    errors.push(
      `v1.7 workstream "${featureKey}" is gated but has no exposure test coverage or acknowledgement.`
    );
    return;
  }

  errors.push(
    `v1.7 workstream "${featureKey}" has no gated surfaces yet and requires a valid acknowledgement in src/config/featureExposure.acknowledgements.json.`
  );
}

/** Returns true when a gated feature has a valid acknowledgement entry. */
export function hasValidAcknowledgement(featureKey, acknowledgements) {
  const acknowledgement = acknowledgements[featureKey];
  return hasValidAcknowledgementReason(acknowledgement) && hasValidAcknowledgementTrackingIssue(acknowledgement);
}

/** Requires exposure tests or explicit acknowledgement for every gated feature. */
export function validateExposureTestContract(contract, errors) {
  const { surfaces, sideEffectModules, acknowledgements, existingTestFiles } = contract;
  for (const featureKey of collectGatedFeatures(surfaces, sideEffectModules)) {
    if (hasPerFeatureTestFile(featureKey, existingTestFiles)) continue;
    if (hasValidAcknowledgement(featureKey, acknowledgements)) continue;
    errors.push(
      `Gated feature "${featureKey}" has no exposure test coverage or acknowledgement. Add a per-feature test or an entry to src/config/featureExposure.acknowledgements.json.`
    );
  }
}

/** Requires every v1.7 workstream key to stay fully disabled with documented adoption coverage. */
export function validateV17WorkstreamAdoption(registry, contract, errors) {
  if (!validateV17RegistryCompleteness(registry, errors)) {
    return;
  }

  const gatedFeatures = collectGatedFeatures(contract.surfaces, contract.sideEffectModules);

  for (const featureKey of V17_WORKSTREAM_KEYS) {
    const definition = registry[featureKey];
    validateV17WorkstreamLifecycle(featureKey, definition, errors);
    validateV17WorkstreamCoverage(featureKey, gatedFeatures, contract, errors);
  }
}
