export const BUILD_TARGETS = ['local', 'beta', 'staging', 'production'] as const;

export type BuildTarget = (typeof BUILD_TARGETS)[number];

/** Resolve a build target, defaulting only an omitted value to local development. */
export const resolveBuildTarget = (value?: string): BuildTarget => {
  if (value === undefined) {
    return 'local';
  }

  if (BUILD_TARGETS.some((target) => target === value)) {
    return value as BuildTarget;
  }

  throw new Error(
    `Invalid VITE_BUILD_TARGET ${JSON.stringify(value)}. Expected one of: ${BUILD_TARGETS.join(', ')}.`
  );
};

/** Returns the deployment target validated and embedded by the Vite build. */
export const getBuildTarget = (): BuildTarget => __GFC_BUILD_TARGET__;
