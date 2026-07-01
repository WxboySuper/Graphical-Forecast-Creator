#!/usr/bin/env node

/** Writes deployment server env overrides from one deploy/*-deployment-config.json file. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderServerEnvFile } from './lib/deployment-config.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const relativeConfigPath = process.argv[2];

if (!relativeConfigPath) {
  console.error('Usage: node scripts/write-deployment-env.mjs <config-json>');
  process.exit(1);
}

const configPath = resolve(ROOT, relativeConfigPath);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const output = renderServerEnvFile(config);

if (output) {
  process.stdout.write(`${output}\n`);
}
