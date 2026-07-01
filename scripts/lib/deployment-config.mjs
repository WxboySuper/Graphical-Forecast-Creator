const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const ENV_VALUE_PATTERN = /^[^\r\n]*$/;

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
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid serverEnv key ${JSON.stringify(key)}.`);
    }

    if (typeof value !== 'string') {
      throw new Error(`serverEnv.${key} must be a string.`);
    }

    if (!ENV_VALUE_PATTERN.test(value)) {
      throw new Error(`serverEnv.${key} must not contain line breaks.`);
    }

    normalizedServerEnv[key] = value;
  }

  return { serverEnv: normalizedServerEnv };
}

/** Renders env-file lines that can be appended to an analytics .env. */
export function renderServerEnvFile(config) {
  const normalized = normalizeDeploymentConfig(config);
  return Object.entries(normalized.serverEnv)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}
