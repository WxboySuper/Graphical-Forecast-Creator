#!/usr/bin/env node

<<<<<<< HEAD
/**
 * Deterministic feature exposure policy check for CI.
 *
 * Extracts registry and surface data from TypeScript source files,
 * evaluates them as plain JavaScript, and runs policy validation.
 * No TypeScript compilation required — works with plain Node.js.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
=======
/** Deterministic, non-executing feature exposure policy check for CI. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
>>>>>>> origin/pr/579
import { evaluateFeatureExposurePolicy } from './lib/feature-exposure-policy.mjs';

const ROOT = resolve(import.meta.dirname, '..');

<<<<<<< HEAD
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
=======
/** Reads a repository source file as UTF-8 text. */
function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

/** Parses source text without executing it. */
function parseSource(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    throw new Error(`Could not parse ${fileName}: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n')}`);
  }
  return sourceFile;
}

/** Returns whether a TypeScript node only wraps another expression. */
function isExpressionWrapper(node) {
  return ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node);
}

/** Removes TypeScript assertion and parenthesis wrappers. */
function unwrapExpression(node) {
  let current = node;
  while (isExpressionWrapper(current)) {
    current = current.expression;
  }
  return current;
}

/** Adds declarations from one variable statement to the constant map. */
function collectVariableDeclarations(statement, constants) {
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && declaration.initializer) {
      constants.set(declaration.name.text, declaration.initializer);
    }
  }
}

/** Indexes top-level initialized variables by name. */
function collectConstants(sourceFile) {
  const constants = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    collectVariableDeclarations(statement, constants);
>>>>>>> origin/pr/579
  }
  return constants;
}

<<<<<<< HEAD
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
=======
/** Reads a non-computed object property name. */
function propertyName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  throw new Error(`Unsupported computed property: ${node.getText()}`);
}

/** Evaluates a reference to another top-level literal constant. */
function evaluateIdentifier(expression, constants, resolving) {
  const name = expression.text;
  const initializer = constants.get(name);
  if (!initializer) throw new Error(`Unsupported identifier ${name}`);
  if (resolving.has(name)) throw new Error(`Circular constant reference involving ${name}`);
  return evaluateLiteral(initializer, constants, new Set(resolving).add(name));
}

/** Evaluates a signed numeric literal. */
function evaluateSignedNumber(expression) {
  const value = Number(expression.operand.text);
  if (expression.operator === ts.SyntaxKind.MinusToken) return -value;
  if (expression.operator === ts.SyntaxKind.PlusToken) return value;
  throw new Error(`Unsupported numeric operator: ${expression.getText()}`);
}

/** Applies an object spread after verifying it resolved to an object. */
function applySpread(property, value, constants, resolving) {
  const spread = evaluateLiteral(property.expression, constants, resolving);
  if (!spread || typeof spread !== 'object') throw new Error(`Object spread must resolve to an object: ${property.getText()}`);
  if (Array.isArray(spread)) throw new Error(`Object spread must not resolve to an array: ${property.getText()}`);
  Object.assign(value, spread);
}

/** Applies one supported property to an evaluated object literal. */
function applyObjectProperty(property, value, constants, resolving) {
  if (ts.isSpreadAssignment(property)) {
    applySpread(property, value, constants, resolving);
    return null;
  }
  if (ts.isPropertyAssignment(property)) {
    value[propertyName(property.name)] = evaluateLiteral(property.initializer, constants, resolving);
    return null;
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    value[property.name.text] = evaluateLiteral(property.name, constants, resolving);
    return null;
  }
  throw new Error(`Unsupported object member: ${property.getText()}`);
}

/** Evaluates an object containing literal metadata only. */
function evaluateObject(expression, constants, resolving) {
  const value = {};
  for (const property of expression.properties) applyObjectProperty(property, value, constants, resolving);
  return value;
}

const LITERAL_READERS = [
  { matches: ts.isStringLiteralLike, read: (node) => node.text },
  { matches: ts.isNumericLiteral, read: (node) => Number(node.text) },
  { matches: (node) => node.kind === ts.SyntaxKind.TrueKeyword, read: () => true },
  { matches: (node) => node.kind === ts.SyntaxKind.FalseKeyword, read: () => false },
  { matches: (node) => node.kind === ts.SyntaxKind.NullKeyword, read: () => null },
  { matches: ts.isPrefixUnaryExpression, read: evaluateSignedNumber },
  { matches: ts.isArrowFunction, read: () => undefined },
  { matches: ts.isFunctionExpression, read: () => undefined },
  { matches: ts.isIdentifier, read: evaluateIdentifier },
  {
    matches: ts.isArrayLiteralExpression,
    read: (node, constants, resolving) =>
      node.elements.map((element) => evaluateLiteral(element, constants, resolving)),
  },
  { matches: ts.isObjectLiteralExpression, read: evaluateObject },
];

/** Safely evaluates the limited literal syntax used by policy configuration. */
function evaluateLiteral(node, constants, resolving = new Set()) {
  const expression = unwrapExpression(node);
  const reader = LITERAL_READERS.find(({ matches }) => matches(expression));
  if (!reader) throw new Error(`Unsupported non-literal expression: ${expression.getText()}`);
  return reader.read(expression, constants, resolving);
}

/** Extracts and safely evaluates a named top-level constant. */
function extractConst(source, fileName, name) {
  const sourceFile = parseSource(source, fileName);
  const constants = collectConstants(sourceFile);
  const initializer = constants.get(name);
  if (!initializer) throw new Error(`Could not find ${name} in ${fileName}`);
  return evaluateLiteral(initializer, constants);
}

/** Reads and validates a string field from an extracted object. */
function getObjectString(object, key, context, required = true) {
  const value = object[key];
  if (typeof value === 'string') return value;
  if (!required && value === undefined) return undefined;
  throw new Error(`${context} must declare a string ${key}`);
}

/** Extracts policy-relevant gated route fields. */
function extractGatedRoutes(source) {
  const routes = extractConst(source, 'featureSurfaces.ts', 'GATED_ROUTE_DEFINITIONS');
  return routes.map((route, index) => ({
    feature: getObjectString(route, 'feature', `GATED_ROUTE_DEFINITIONS[${index}]`),
    path: getObjectString(route, 'path', `GATED_ROUTE_DEFINITIONS[${index}]`),
  }));
}

/** Extracts policy-relevant navigation fields. */
function extractNavigationItems(source) {
  const items = extractConst(source, 'featureNavigation.ts', 'APP_NAVIGATION_ITEMS');
  return items.map((item, index) => ({
    id: getObjectString(item, 'id', `APP_NAVIGATION_ITEMS[${index}]`),
    to: getObjectString(item, 'to', `APP_NAVIGATION_ITEMS[${index}]`),
    label: getObjectString(item, 'label', `APP_NAVIGATION_ITEMS[${index}]`),
    feature: getObjectString(item, 'feature', `APP_NAVIGATION_ITEMS[${index}]`, false),
  }));
}

/** Extracts declared server capability keys. */
function extractServerCapabilityKeys(source) {
  const registry = extractConst(source, 'serverFeatureExposure.js', 'SERVER_FEATURE_EXPOSURE_REGISTRY');
  return Object.values(registry)
    .map((definition) => definition.serverCapabilityKey)
    .filter((key) => typeof key === 'string');
}

/** Loads every policy input from repository sources. */
function loadPolicyInputs() {
  const registry = extractConst(
    readSource('src/config/featureExposure.ts'),
    'featureExposure.ts',
    'FEATURE_EXPOSURE_REGISTRY'
  );
  const gatedRoutes = extractGatedRoutes(readSource('src/config/featureSurfaces.ts'));
  const navigationItems = extractNavigationItems(readSource('src/config/featureNavigation.ts'));
  const serverCapabilityKeys = extractServerCapabilityKeys(
    readSource('server/lib/serverFeatureExposure.js')
  );
  return { registry, gatedRoutes, navigationItems, serverCapabilityKeys };
}

/** Executes the policy check and prints CI diagnostics. */
function main() {
  let inputs = null;
  try {
    inputs = loadPolicyInputs();
  } catch (error) {
    console.error(`Failed to extract feature exposure policy inputs: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { registry, gatedRoutes, navigationItems, serverCapabilityKeys } = inputs;
  const result = evaluateFeatureExposurePolicy(
    registry,
    { gatedRoutes, navigationItems },
    serverCapabilityKeys
  );

  if (!result.ok) {
    console.error('Feature exposure policy FAILED:');
    for (const error of result.errors) console.error(`  x ${error}`);
    console.error(`\n${result.errors.length} violation(s) found.`);
    process.exitCode = 1;
    return;
  }

  console.log('Feature exposure policy OK: all checks passed.');
  console.log(`  Registry: ${Object.keys(registry).length} features`);
  console.log(`  Gated routes: ${gatedRoutes.length}`);
  console.log(`  Navigation items: ${navigationItems.length}`);
  console.log(`  Server capability keys: ${serverCapabilityKeys.length}`);
>>>>>>> origin/pr/579
}

main();
