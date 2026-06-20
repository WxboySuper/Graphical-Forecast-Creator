export const BUILD_TARGETS = Object.freeze(['local', 'beta', 'staging', 'production']);

/** Resolve a build target, defaulting only an omitted value to local development. */
export const resolveBuildTarget = (value) => {
  if (value === undefined) {
    return 'local';
  }

  if (BUILD_TARGETS.includes(value)) {
    return value;
  }

  throw new Error(
    `Invalid VITE_BUILD_TARGET ${JSON.stringify(value)}. Expected one of: ${BUILD_TARGETS.join(', ')}.`
  );
};
