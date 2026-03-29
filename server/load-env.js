'use strict';

const fs = require('fs');
const path = require('path');

/** True when the value is wrapped in matching single or double quotes. */
const hasWrappingQuotes = (value) =>
  (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));

/** Removes one layer of wrapping quotes from an env value. */
const unwrapEnvValue = (value) => (hasWrappingQuotes(value) ? value.slice(1, -1) : value);

/** Returns the key/value pair for one .env line, or null when the line should be ignored. */
const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  if (!key) {
    return null;
  }

  return {
    key,
    value: unwrapEnvValue(trimmed.slice(separatorIndex + 1).trim()),
  };
};

/** Applies parsed env entries only when they are not already defined in the process. */
const assignMissingEnvValues = (lines) => {
  for (const line of lines) {
    const entry = parseEnvLine(line);
    if (!entry || process.env[entry.key] !== undefined) {
      continue;
    }

    process.env[entry.key] = entry.value;
  }
};

/** Loads the repo-root .env file into process.env for local and VPS server runs. */
const loadRootEnv = () => {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  assignMissingEnvValues(lines);
};

loadRootEnv();
