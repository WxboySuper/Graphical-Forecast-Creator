import ts from 'typescript';

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
  }
  return constants;
}

/** Parses source text without executing it. */
export function parseSource(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    throw new Error(`Could not parse ${fileName}: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n')}`);
  }
  return sourceFile;
}

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
export function extractConst(source, fileName, name) {
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
export function extractGatedRoutes(source) {
  const routes = extractConst(source, 'featureSurfaces.ts', 'GATED_ROUTE_DEFINITIONS');
  return routes.map((route, index) => ({
    feature: getObjectString(route, 'feature', `GATED_ROUTE_DEFINITIONS[${index}]`),
    path: getObjectString(route, 'path', `GATED_ROUTE_DEFINITIONS[${index}]`),
  }));
}

/** Extracts policy-relevant navigation fields. */
export function extractNavigationItems(source) {
  const items = extractConst(source, 'featureNavigation.ts', 'APP_NAVIGATION_ITEMS');
  return items.map((item, index) => ({
    id: getObjectString(item, 'id', `APP_NAVIGATION_ITEMS[${index}]`),
    to: getObjectString(item, 'to', `APP_NAVIGATION_ITEMS[${index}]`),
    label: getObjectString(item, 'label', `APP_NAVIGATION_ITEMS[${index}]`),
    feature: getObjectString(item, 'feature', `APP_NAVIGATION_ITEMS[${index}]`, false),
  }));
}

/** Extracts the server-backed feature registry. */
export function extractServerRegistry(source) {
  return extractConst(source, 'serverFeatureExposure.js', 'SERVER_FEATURE_EXPOSURE_REGISTRY');
}

/** Extracts declared server capability keys. */
export function extractServerCapabilityKeys(serverRegistry) {
  return Object.values(serverRegistry)
    .map((definition) => definition.serverCapabilityKey)
    .filter((key) => typeof key === 'string');
}

/** Extracts side-effect module declarations keyed by feature. */
export function extractSideEffectModules(source) {
  return extractConst(source, 'featureSurfaces.ts', 'FEATURE_SIDE_EFFECT_MODULES');
}

/** Returns true when a value is a plain object map rather than an array or primitive. */
export function isPlainObjectMap(value) {
  if (!value) return false;
  if (typeof value !== 'object') return false;
  return !Array.isArray(value);
}

/** Ensures acknowledgement JSON parsed to a plain object map. */
export function assertAcknowledgementsShape(acknowledgements) {
  if (isPlainObjectMap(acknowledgements)) return;
  throw new Error('featureExposure.acknowledgements.json must contain a top-level object.');
}
