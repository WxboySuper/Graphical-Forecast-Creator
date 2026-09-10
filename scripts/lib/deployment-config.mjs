/**
 * Normalizes deployment configuration values and validates environment-key maps for release scripts.
 * This helper owns deployment-config shape validation; environment loading, provisioning, and publication are handled by callers.
 */
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** Returns true when value is a plain object map rather than an array or primitive. */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Normalizes and validates deployment config JSON. */
export function normalizeDeploymentConfig(config) {
  if (!isPlainObject(config)) {
    throw new Error('Deployment config must be a JSON object.');
  }

  const serverEnv = config.serverEnv;
  if (!isPlainObject(serverEnv)) {
    throw new Error('Deployment config must declare a serverEnv object.');
  }

  const normalizedServerEnv = {};
  for (const [key, value] of Object.entries(serverEnv)) {
    normalizedServerEnv[normalizeServerEnvKey(key)] = normalizeServerEnvValue(key, value);
  }

  const environment = config.environment;
  if (environment !== undefined && typeof environment !== 'string') {
    throw new Error('Deployment config environment must be a string.');
  }

  return {
    ...(environment === undefined ? {} : { environment }),
    serverEnv: normalizedServerEnv,
  };
}

/** Merges a shared config with an environment override and validates the result. */
export function mergeDeploymentConfigs(baseConfig, overrideConfig) {
  if (!isPlainObject(baseConfig) || !isPlainObject(overrideConfig)) {
    throw new Error('Deployment configs must be JSON objects.');
  }

  return normalizeDeploymentConfig({
    ...(overrideConfig.environment === undefined
      ? { environment: baseConfig.environment }
      : { environment: overrideConfig.environment }),
    serverEnv: {
      ...(isPlainObject(baseConfig.serverEnv) ? baseConfig.serverEnv : {}),
      ...(isPlainObject(overrideConfig.serverEnv) ? overrideConfig.serverEnv : {}),
    },
  });
}

/** Validates one env key and returns it unchanged for map construction. */
function normalizeServerEnvKey(key) {
  if (!ENV_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid serverEnv key ${JSON.stringify(key)}.`);
  }

  return key;
}

/** Validates one env value and returns it unchanged for map construction. */
function normalizeServerEnvValue(key, value) {
  if (typeof value !== 'string') {
    throw new Error(`serverEnv.${key} must be a string.`);
  }

  if (/\r|\n/.test(value)) {
    throw new Error(`serverEnv.${key} must not contain line breaks.`);
  }

  return value;
}

/** Renders env-file lines that can be appended to an analytics .env. */
export function renderServerEnvFile(config) {
  const normalized = normalizeDeploymentConfig(config);
  return Object.entries(normalized.serverEnv)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}
