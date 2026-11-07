import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEagerModuleImports } from './lib/bundle-imports.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const BUILD_DIR = resolve(ROOT, 'build', 'assets');

/** Maximum accepted size (in bytes) for the initial entry chunk. */
const ENTRY_CHUNK_BUDGET_BYTES = 450 * 1024; // 450 kB

/** Maximum accepted total (in bytes) for all JS chunks. */
const TOTAL_JS_BUDGET_BYTES = 3.5 * 1024 * 1024; // 3.5 MB

const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>/gi;
const SRC_ATTRIBUTE_PATTERN = /\bsrc\s*=\s*"([^"]+)"/i;

/**
 * Resolves a script URL from build/index.html to a path relative to the build
 * root, honouring Vite's `base` (including an absolute base URL). Returns null
 * for cross-origin scripts so a CDN tag is never mistaken for the entry chunk.
 *
 * @param {string} src
 * @param {string} base
 * @returns {string | null}
 */
const resolveScriptPath = (src, base) => {
  try {
    const baseUrl = new URL(base, 'http://localhost');
    const resolved = new URL(src, baseUrl);
    if (resolved.origin !== baseUrl.origin) return null;
    const basePath = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;
    const pathname = resolved.pathname.startsWith(basePath)
      ? resolved.pathname.slice(basePath.length)
      : resolved.pathname.replace(/^\/+/, '');
    return pathname;
  } catch {
    return null;
  }
};

/**
 * Finds the entry script chunk in built HTML. Prefers the module script Vite
 * emits and ignores non-JS, cross-origin, and query-string variants.
 *
 * @param {string} html
 * @param {string} [base]
 * @returns {string | null}
 */
export const entryChunkFromHtml = (html, base = '/') => {
  const scripts = [...html.matchAll(SCRIPT_TAG_PATTERN)]
    .map((tag) => ({
      attributes: tag[1],
      src: SRC_ATTRIBUTE_PATTERN.exec(tag[1])?.[1] ?? null,
    }))
    .filter((script) => script.src !== null)
    .map((script) => ({ ...script, path: resolveScriptPath(script.src, base) }))
    .filter((script) => script.path !== null && script.path.endsWith('.js'));

  const entry = scripts.find((script) => /\btype\s*=\s*"module"/i.test(script.attributes)) ?? scripts[0];
  return entry?.path ?? null;
};

/**
 * Lists JavaScript chunk paths relative to an asset directory, including any
 * nested output directories.
 *
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]}
 */
export const listJsChunks = (dir, prefix = '') => {
  const chunks = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      chunks.push(...listJsChunks(resolve(dir, entry.name), relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      chunks.push(relativePath);
    }
  }
  return chunks;
};

/** Reads the built index.html to find the entry script chunk. */
const findEntryChunk = () => {
  const html = readFileSync(resolve(ROOT, 'build', 'index.html'), 'utf8');
  return entryChunkFromHtml(html, process.env.PUBLIC_URL || '/');
};

/** Returns sizes for a given built asset file. */
const assetSize = (relativePath) => {
  const file = readFileSync(resolve(ROOT, 'build', relativePath));
  return file.byteLength;
};

/** Validates the built entry's static dependencies and JavaScript size budgets. */
const main = () => {
  const entryPath = findEntryChunk();
  if (!entryPath) {
    console.error('Could not locate the entry JS chunk in build/index.html.');
    process.exit(1);
  }

  const entryBytes = assetSize(entryPath);
  const entrySource = readFileSync(resolve(ROOT, 'build', entryPath), 'utf8');
  const eagerTurfImports = getEagerModuleImports(entrySource).filter((specifier) => specifier.includes('turf'));
  if (eagerTurfImports.length > 0) {
    console.error(`Entry chunk eagerly imports Turf: ${eagerTurfImports.join(', ')}`);
    process.exit(1);
  }
  const budgetKb = (ENTRY_CHUNK_BUDGET_BYTES / 1024).toFixed(0);
  const entryKb = (entryBytes / 1024).toFixed(1);

  if (entryBytes > ENTRY_CHUNK_BUDGET_BYTES) {
    console.error(
      `Entry chunk budget exceeded: ${entryPath} is ${entryKb} kB (budget ${budgetKb} kB). ` +
        'Move more feature code behind lazy route chunks or reduce eager imports.'
    );
    process.exit(1);
  }

  const jsFiles = listJsChunks(BUILD_DIR);
  const totalJs = jsFiles.reduce((sum, name) => sum + readFileSync(resolve(BUILD_DIR, name)).byteLength, 0);
  const totalKb = (totalJs / 1024).toFixed(0);

  if (totalJs > TOTAL_JS_BUDGET_BYTES) {
    console.error(
      `Total JS budget exceeded: ${totalKb} kB across ${jsFiles.length} chunks (budget ${(TOTAL_JS_BUDGET_BYTES / 1024).toFixed(0)} kB).`
    );
    process.exit(1);
  }

  console.log(`Entry chunk OK: ${entryPath} (${entryKb} kB / ${budgetKb} kB budget).`);
  console.log(`Total JS OK: ${totalKb} kB across ${jsFiles.length} chunks (budget ${(TOTAL_JS_BUDGET_BYTES / 1024).toFixed(0)} kB).`);
};

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  main();
}
