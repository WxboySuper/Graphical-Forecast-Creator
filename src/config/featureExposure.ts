import { BUILD_TARGETS, type BuildTarget, getBuildTarget } from './buildTarget';

export type FeatureExposureMatrix = Record<BuildTarget, boolean>;

type FeatureExposureBase = {
  exposure: FeatureExposureMatrix;
  owner: string;
  addedDate: string;
  trackingIssue?: number;
};

type ServerBackedMetadata =
  | { serverBacked: true; serverCapabilityKey: string }
  | { serverBacked: false; serverCapabilityKey?: never };

export type TemporaryFeatureExposureDefinition = FeatureExposureBase & {
  temporary: true;
  removalCondition: string;
} & ServerBackedMetadata;

export type PermanentFeatureExposureDefinition = FeatureExposureBase & {
  temporary: false;
  serverBacked: false;
  serverCapabilityKey?: never;
};

export type FeatureExposureDefinition =
  | TemporaryFeatureExposureDefinition
  | PermanentFeatureExposureDefinition;

const ALL_TARGETS_OFF: FeatureExposureMatrix = {
  local: false,
  beta: false,
  staging: false,
  production: false,
};

/** Single source of truth for v1.7 feature exposure and lifecycle metadata. */
export const FEATURE_EXPOSURE_REGISTRY = {
  autoTstm: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition:
      'Enable on beta when Auto-TSTM client and server gates ship (#427); remove after stable production rollout.',
    serverBacked: true,
    serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
    trackingIssue: 427,
  },
  forecastWorkflowV2: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Remove after forecast workflow v2 replaces the current cycle workflow (#429).',
    serverBacked: false,
    trackingIssue: 429,
  },
  verificationRelaunch: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Remove after verification analytics relaunch reaches production (#430).',
    serverBacked: false,
    trackingIssue: 430,
  },
  customProducts: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Remove after custom layers and premium forecast products ship (#431).',
    serverBacked: false,
    trackingIssue: 431,
  },
  tropicalWorkspace: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition:
      'Keep disabled on production until tropical workspace foundations are complete (#432).',
    serverBacked: false,
    trackingIssue: 432,
  },
  collaborationRoom: {
    exposure: { ...ALL_TARGETS_OFF },
    owner: 'WxboySuper',
    addedDate: '2026-06-20',
    temporary: true,
    removalCondition: 'Remove after forecast collaboration room foundations ship (#433).',
    serverBacked: false,
    trackingIssue: 433,
  },
} as const satisfies Record<string, FeatureExposureDefinition>;

export type FeatureKey = keyof typeof FEATURE_EXPOSURE_REGISTRY;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Ensures every build target has a boolean exposure value. */
function assertExposureMatrix(featureKey: string, exposure: FeatureExposureMatrix): void {
  for (const target of BUILD_TARGETS) {
    if (typeof exposure[target] !== 'boolean') {
      throw new Error(`Feature ${featureKey} is missing exposure for target ${target}.`);
    }
  }
}

/** Ensures addedDate uses a real ISO calendar date. */
function assertAddedDate(featureKey: string, addedDate: string): void {
  if (!ISO_DATE_PATTERN.test(addedDate)) {
    throw new Error(`Feature ${featureKey} has an invalid addedDate ${JSON.stringify(addedDate)}.`);
  }

  const [year, month, day] = addedDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Feature ${featureKey} has an invalid addedDate ${JSON.stringify(addedDate)}.`);
  }
}

/** Ensures temporary features declare when they should be removed. */
function assertTemporaryMetadata(featureKey: string, definition: FeatureExposureDefinition): void {
  if (definition.temporary && definition.removalCondition.trim().length === 0) {
    throw new Error(`Temporary feature ${featureKey} must declare a removalCondition.`);
  }
}

/** Ensures server-backed metadata matches the declared capability key. */
function assertServerBackedMetadata(featureKey: string, definition: FeatureExposureDefinition): void {
  if (definition.serverBacked && !definition.serverCapabilityKey?.trim()) {
    throw new Error(`Server-backed feature ${featureKey} must declare serverCapabilityKey.`);
  }

  if (!definition.serverBacked && definition.serverCapabilityKey) {
    throw new Error(`Feature ${featureKey} must not declare serverCapabilityKey when serverBacked is false.`);
  }
}

/** Runs every registry lifecycle assertion for one feature entry. */
function assertFeatureExposureDefinition(featureKey: string, definition: FeatureExposureDefinition): void {
  assertExposureMatrix(featureKey, definition.exposure);
  assertAddedDate(featureKey, definition.addedDate);
  assertTemporaryMetadata(featureKey, definition);
  assertServerBackedMetadata(featureKey, definition);
}

/** Validates registry shape and lifecycle metadata for tests and future CI policy checks. */
export const validateFeatureExposureRegistry = (
  registry: Record<string, FeatureExposureDefinition> = FEATURE_EXPOSURE_REGISTRY
): void => {
  for (const [featureKey, definition] of Object.entries(registry)) {
    assertFeatureExposureDefinition(featureKey, definition);
  }
};

validateFeatureExposureRegistry();

/** Returns every typed feature key declared in the registry. */
export const getFeatureKeys = (): FeatureKey[] =>
  Object.keys(FEATURE_EXPOSURE_REGISTRY) as FeatureKey[];

/** Returns the full registry entry for diagnostics and governance tooling. */
export const getFeatureExposure = (feature: FeatureKey): FeatureExposureDefinition =>
  FEATURE_EXPOSURE_REGISTRY[feature];

/** Returns whether a feature is exposed for the given deployment target. */
export const isFeatureExposedOnTarget = (feature: FeatureKey, target: BuildTarget): boolean =>
  FEATURE_EXPOSURE_REGISTRY[feature].exposure[target];

/** Returns whether a feature is exposed on the current build target. */
export const isFeatureExposed = (feature: FeatureKey, target: BuildTarget = getBuildTarget()): boolean =>
  isFeatureExposedOnTarget(feature, target);
