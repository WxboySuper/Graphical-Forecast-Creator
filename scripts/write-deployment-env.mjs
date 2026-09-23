#!/usr/bin/env node

/** Writes deployment server env overrides from one deploy/*-deployment-config.json file. */

import { readFileSync, realpathSync } from 'node:fs';
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

/** Returns whether a resolved config path remains inside deploy/. */
const isDeployPath = (candidatePath) => {
  const relativePath = relative(DEPLOY_DIR, candidatePath);
  return !relativePath.startsWith('..') && !isAbsolute(relativePath) && relativePath !== '';
};

/** Reads one deployment config and recursively merges its optional shared parent. */
const readDeploymentConfig = (candidatePath, seen = new Set()) => {
  const resolvedPath = resolveDeploymentPath(candidatePath);
  const nextSeen = addSeenPath(resolvedPath, seen);
  const config = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  if (!Object.prototype.hasOwnProperty.call(config, 'extends')) {
    return config;
  }

  return readInheritedDeploymentConfig(config, nextSeen);
};

/** Resolves a config path and enforces the deploy directory boundary after symlinks. */
const resolveDeploymentPath = (candidatePath) => {
  if (!isDeployPath(candidatePath)) {
    throw new Error('Deployment config inheritance must stay under deploy/.');
  }
  const resolvedPath = realpathSync(candidatePath);
  if (!isDeployPath(resolvedPath)) {
    throw new Error('Deployment config inheritance must stay under deploy/.');
  }
  return resolvedPath;
};

/** Tracks resolved config paths and rejects inheritance cycles. */
const addSeenPath = (resolvedPath, seen) => {
  if (seen.has(resolvedPath)) {
    throw new Error(`Deployment config inheritance cycle at ${resolvedPath}.`);
  }

  const nextSeen = new Set(seen);
  nextSeen.add(resolvedPath);
  return nextSeen;
};

/** Reads and merges the parent named by an inherited deployment config. */
const readInheritedDeploymentConfig = (config, seen) => {
  if (typeof config.extends !== 'string' || config.extends.trim() === '') {
    throw new Error('Deployment config extends must be a non-empty string.');
  }

  const parentPath = resolve(DEPLOY_DIR, config.extends);
  const parentConfig = readDeploymentConfig(parentPath, seen);
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
