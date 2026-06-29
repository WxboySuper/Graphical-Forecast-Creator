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

/** Returns true when a gated feature has a valid acknowledgement entry. */
function hasValidAcknowledgement(featureKey, acknowledgements) {
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
