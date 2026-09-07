#!/usr/bin/env node

/** Writes deployment server env overrides from one deploy/*-deployment-config.json file. */

import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { mergeDeploymentConfigs, renderServerEnvFile } from './lib/deployment-config.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DEPLOY_DIR = resolve(ROOT, 'deploy');
const relativeConfigPath = process.argv[2];

if (!relativeConfigPath) {
  console.error('Usage: node scripts/write-deployment-env.mjs <config-json>');
  process.exit(1);
}

const configPath = resolve(ROOT, relativeConfigPath);
const configPathFromDeploy = relative(DEPLOY_DIR, configPath);

if (
  configPathFromDeploy.startsWith('..') ||
  isAbsolute(configPathFromDeploy) ||
  configPathFromDeploy === ''
) {
  console.error('Deployment config path must point to a file under deploy/.');
  process.exit(1);
}

const isDeployPath = (candidatePath) => {
  const relativePath = relative(DEPLOY_DIR, candidatePath);
  return !relativePath.startsWith('..') && !isAbsolute(relativePath) && relativePath !== '';
};

const readDeploymentConfig = (candidatePath, seen = new Set()) => {
  if (!isDeployPath(candidatePath)) {
    throw new Error('Deployment config inheritance must stay under deploy/.');
  }
  if (seen.has(candidatePath)) {
    throw new Error(`Deployment config inheritance cycle at ${candidatePath}.`);
  }

  const nextSeen = new Set(seen);
  nextSeen.add(candidatePath);
  const config = JSON.parse(readFileSync(candidatePath, 'utf8'));
  if (typeof config.extends !== 'string') {
    return config;
  }

  const parentPath = resolve(DEPLOY_DIR, config.extends);
  const parentConfig = readDeploymentConfig(parentPath, nextSeen);
  const overrideConfig = { ...config };
  delete overrideConfig.extends;
  return mergeDeploymentConfigs(parentConfig, overrideConfig);
};

let output = '';
try {
  const config = readDeploymentConfig(configPath);
  output = renderServerEnvFile(config);
} catch (error) {
  console.error(`Failed to read deployment config ${relativeConfigPath}: ${error.message}`);
  process.exit(1);
}

if (output) {
  process.stdout.write(`${output}\n`);
}
