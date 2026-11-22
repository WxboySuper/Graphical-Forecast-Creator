/**
 * Tiny strict template engine for the marketing site. It supports front matter,
 * `{{> partial}}` includes, `{{ value }}` (HTML-escaped) and `{{{ value }}}` (raw)
 * substitution. Missing partials or values throw so a typo fails the build
 * instead of shipping a blank hole in a page.
 */

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Escapes text for safe use in HTML text and attribute values. */
export const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Splits an optional `key: value` front matter block from the page body. */
export const parseFrontMatter = (source) => {
  const match = FRONT_MATTER.exec(source);
  if (!match) return { meta: {}, body: source };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator > 0) meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { meta, body: source.slice(match[0].length) };
};

const lookup = (values, key) => {
  if (!Object.hasOwn(values, key)) throw new Error(`Missing template value "${key}"`);
  return values[key];
};

const expandPartials = (template, partials, depth = 0) => {
  if (depth > 5) throw new Error('Partials are nested too deeply');
  return template.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_match, name) => {
    if (!Object.hasOwn(partials, name)) throw new Error(`Missing partial "${name}"`);
    return expandPartials(partials[name], partials, depth + 1);
  });
};

/** Renders a template with partial includes and escaped or raw values. */
// One pass over the template, so substituted values are never scanned for further tags.
const VALUE_TAG = /\{\{\{\s*([\w.-]+)\s*\}\}\}|\{\{\s*([\w.-]+)\s*\}\}/g;

export const renderTemplate = (template, values, partials = {}) =>
  expandPartials(template, partials).replace(VALUE_TAG, (_match, rawKey, escapedKey) =>
    rawKey ? String(lookup(values, rawKey)) : escapeHtml(lookup(values, escapedKey)));
