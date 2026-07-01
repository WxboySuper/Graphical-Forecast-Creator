#!/usr/bin/env node

/** Writes deployment server env overrides from one deploy/*-deployment-config.json file. */

import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { renderServerEnvFile } from './lib/deployment-config.mjs';

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

let output = '';
try {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  output = renderServerEnvFile(config);
} catch (error) {
  console.error(`Failed to read deployment config ${relativeConfigPath}: ${error.message}`);
  process.exit(1);
}

if (output) {
  process.stdout.write(`${output}\n`);
}
