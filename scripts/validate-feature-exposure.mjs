#!/usr/bin/env node

/**
 * Deterministic feature exposure policy check for CI.
 *
 * Extracts registry and surface data from TypeScript source files,
 * evaluates them as plain JavaScript, and runs policy validation.
 * No TypeScript compilation required — works with plain Node.js.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateFeatureExposurePolicy } from './lib/feature-exposure-policy.mjs';

const ROOT = resolve(import.meta.dirname, '..');

// ── Source file paths ──────────────────────────────────────────────
const FEATURE_EXPOSURE_PATH = resolve(ROOT, 'src/config/featureExposure.ts');
const FEATURE_SURFACES_PATH = resolve(ROOT, 'src/config/featureSurfaces.ts');
const FEATURE_NAVIGATION_PATH = resolve(ROOT, 'src/config/featureNavigation.ts');
const SERVER_FEATURE_EXPOSURE_PATH = resolve(ROOT, 'server/lib/serverFeatureExposure.js');

// ── Extraction helpers ─────────────────────────────────────────────

/** Reads a source file as text. */
function readSource(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

/**
 * Extracts a const array literal from source text.
 * Returns the evaluated JavaScript array.
 */
function extractConstArray(source, varName) {
  const pattern = new RegExp(
    `export\\s+const\\s+${varName}\\s*=\\s*(\\[.*?\\])\\s*as\\s+const`,
    's'
  );
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not extract ${varName} from source`);
  return eval(match[1]);
}

/**
 * Extracts a const object literal from source text.
 * Strips TypeScript 'as const' and 'satisfies' syntax before evaluation.
 */
function extractConstObject(source, varName) {
  const pattern = new RegExp(
    `(?:\\/\\*\\*[\\s\\S]*?\\*\\/\\s*)?export\\s+const\\s+${varName}\\s*=\\s*`,
    ''
  );
  const startMatch = source.match(pattern);
  if (!startMatch) throw new Error(`Could not find ${varName} in source`);

  const startIdx = startMatch.index + startMatch[0].length;

  // Track brace depth to find the end of the object literal
  let depth = 0;
  let endIdx = startIdx;
  for (; endIdx < source.length; endIdx++) {
    if (source[endIdx] === '{') depth++;
    else if (source[endIdx] === '}') {
      depth--;
      if (depth === 0) { endIdx++; break; }
    }
  }

  let objectText = source.slice(startIdx, endIdx);

  // Strip TypeScript-specific syntax
  objectText = objectText.replace(/\bas\s+const\b/g, '');
  objectText = objectText.replace(/\bsatisfies\b\s+\S+/g, '');

  return eval(`(${objectText})`);
}

/**
 * Extracts inline constants (e.g., CORE_PRODUCT_OWNER = 'value') from source.
 * Handles string literals, object literals, and type annotations between name and value.
 */
function extractInlineConstants(source, varNames) {
  const constants = {};
  for (const name of varNames) {
    // Try string literal first (with optional type annotation)
    const strMatch = source.match(
      new RegExp(`(?:const|let)\\s+${name}(?:\\s*:\\s*[^=]+)?\\s*=\\s*['"]([^'"]+)['"]`)
    );
    if (strMatch) {
      constants[name] = strMatch[1];
      continue;
    }

    // Try object literal — extract from = { to matching }
    const objStartMatch = source.match(
      new RegExp(`(?:const|let)\\s+${name}(?:\\s*:\\s*[^=]+)?\\s*=\\s*\\{`)
    );
    if (objStartMatch) {
      const startIdx = objStartMatch.index + objStartMatch[0].length - 1;
      let depth = 0;
      let endIdx = startIdx;
      for (; endIdx < source.length; endIdx++) {
        if (source[endIdx] === '{') depth++;
        else if (source[endIdx] === '}') {
          depth--;
          if (depth === 0) { endIdx++; break; }
        }
      }
      constants[name] = eval(`(${source.slice(startIdx, endIdx)})`);
    }
  }
  return constants;
}

/**
 * Extracts gated route feature keys from featureSurfaces.ts.
 * Parses { feature: 'key', ... } entries from GATED_ROUTE_DEFINITIONS.
 */
function extractGatedRouteFeatures(source) {
  const routes = [];
  // Match individual route objects within the array
  const objectPattern = /\{\s*feature:\s*'([^']+)',\s*path:\s*'([^']+)'/g;
  let match;
  while ((match = objectPattern.exec(source)) !== null) {
    routes.push({ feature: match[1], path: match[2] });
  }
  return routes;
}

/**
 * Extracts navigation item feature keys from featureNavigation.ts.
 * Parses { id: '...', feature?: 'key' } entries from APP_NAVIGATION_ITEMS.
 */
function extractNavigationFeatures(source) {
  const items = [];
  // Split by top-level objects in the array — each item starts with { id:
  const itemBlocks = source.split(/\{\s*id:\s*/g).slice(1);

  for (const block of itemBlocks) {
    const idMatch = block.match(/^'([^']+)'/);
    const toMatch = block.match(/to:\s*'([^']+)'/);
    const labelMatch = block.match(/label:\s*'([^']+)'/);
    const featureMatch = block.match(/feature:\s*'([^']+)'/);

    if (idMatch && toMatch && labelMatch) {
      items.push({
        id: idMatch[1],
        to: toMatch[1],
        label: labelMatch[1],
        feature: featureMatch ? featureMatch[1] : undefined,
      });
    }
  }
  return items;
}

/**
 * Extracts server capability keys from server/lib/serverFeatureExposure.js.
 * Parses SERVER_FEATURE_EXPOSURE_REGISTRY and computes keys from it.
 */
function extractServerCapabilityKeys(source) {
  // Extract the registry object using brace-depth tracking
  const startPattern = /const\s+SERVER_FEATURE_EXPOSURE_REGISTRY\s*=\s*\{/;
  const startMatch = source.match(startPattern);
  if (!startMatch) return [];

  const startIdx = startMatch.index + startMatch[0].length - 1;
  let depth = 0;
  let endIdx = startIdx;
  for (; endIdx < source.length; endIdx++) {
    if (source[endIdx] === '{') depth++;
    else if (source[endIdx] === '}') {
      depth--;
      if (depth === 0) { endIdx++; break; }
    }
  }

  const registryText = source.slice(startIdx, endIdx);
  // Extract serverCapabilityKey values
  const keys = [];
  const keyPattern = /serverCapabilityKey:\s*'([^']+)'/g;
  let match;
  while ((match = keyPattern.exec(registryText)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

// ── Main validation ────────────────────────────────────────────────

function main() {
  const errors = [];

  // 1. Extract and evaluate the feature exposure registry
  let registry;
  try {
    const source = readSource('src/config/featureExposure.ts');

    // Extract all constants referenced in the registry object
    const injectedNames = [
      'ALL_TARGETS_OFF',
      'ALL_TARGETS_ON',
      'CORE_PRODUCT_OWNER',
      'CORE_PRODUCT_ADDED_DATE',
    ];
    const inlineConstants = extractInlineConstants(source, injectedNames);

    // Inject into globalThis so eval() can resolve spreads like { ...ALL_TARGETS_OFF }
    for (const [key, value] of Object.entries(inlineConstants)) {
      globalThis[key] = value;
    }

    registry = extractConstObject(source, 'FEATURE_EXPOSURE_REGISTRY');

    // Cleanup injected globals
    for (const key of Object.keys(inlineConstants)) {
      delete globalThis[key];
    }
  } catch (err) {
    console.error(`Failed to extract feature exposure registry: ${err.message}`);
    process.exit(1);
  }

  // 2. Extract surface definitions
  let gatedRoutes;
  let navigationItems;
  try {
    const surfacesSource = readSource('src/config/featureSurfaces.ts');
    gatedRoutes = extractGatedRouteFeatures(surfacesSource);
  } catch (err) {
    console.error(`Failed to extract feature surfaces: ${err.message}`);
    process.exit(1);
  }

  try {
    const navSource = readSource('src/config/featureNavigation.ts');
    navigationItems = extractNavigationFeatures(navSource);
  } catch (err) {
    console.error(`Failed to extract feature navigation: ${err.message}`);
    process.exit(1);
  }

  // 3. Extract server capability keys
  let serverCapabilityKeys = [];
  try {
    const serverSource = readSource('server/lib/serverFeatureExposure.js');
    serverCapabilityKeys = extractServerCapabilityKeys(serverSource);
  } catch (err) {
    // Server file may not exist yet — not a hard failure
    console.warn(`Warning: Could not read server feature exposure: ${err.message}`);
  }

  // 4. Run policy evaluation
  const surfaces = { gatedRoutes, navigationItems };
  const result = evaluateFeatureExposurePolicy(registry, surfaces, serverCapabilityKeys);

  // 5. Report results
  if (result.ok) {
    console.log('Feature exposure policy OK: all checks passed.');
    console.log(`  Registry: ${Object.keys(registry).length} features`);
    console.log(`  Gated routes: ${gatedRoutes.length}`);
    console.log(`  Navigation items: ${navigationItems.length}`);
    console.log(`  Server capability keys: ${serverCapabilityKeys.length}`);
    process.exit(0);
  }

  console.error('Feature exposure policy FAILED:');
  for (const error of result.errors) {
    console.error(`  ✗ ${error}`);
  }
  console.error(`\n${result.errors.length} violation(s) found.`);
  process.exit(1);
}

main();
