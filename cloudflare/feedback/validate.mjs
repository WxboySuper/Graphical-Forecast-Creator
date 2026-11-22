const CATEGORIES = new Set(['bug', 'idea', 'praise', 'question', 'other']);
const TARGETS = new Set(['beta', 'production']);
const PLANS = new Set(['free', 'premium']);
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g');
export const clean = (value) => value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();

const isText = (value) => typeof value === 'string';
const hasLength = (value, min, max) => value.length >= min && value.length <= max;
// Stored pages are router paths only: a leading slash and URL-path characters, so they are never usable as links or markup.
const SAFE_PAGE = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/;
const cleanPage = (value) => clean(value.split(/[?#]/, 1)[0]);
const fields = {
  category: (value) => typeof value === 'string' && CATEGORIES.has(value),
  message: (value) => isText(value) && hasLength(clean(value), 10, 4000),
  page: (value) => isText(value) && hasLength(cleanPage(value), 1, 200) && SAFE_PAGE.test(cleanPage(value)),
  appVersion: (value) => isText(value) && hasLength(clean(value), 1, 40),
  buildTarget: (value) => typeof value === 'string' && TARGETS.has(value),
  contactOk: (value) => typeof value === 'boolean',
  viewport: (value) => value === undefined || value === null || (isText(value) && clean(value).length <= 20),
  plan: (value) => value === undefined || value === null || (typeof value === 'string' && PLANS.has(value)),
};
const allowedFields = new Set(Object.keys(fields));

export function validate(body) {
  if (!body) return null;
  if (typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).some((key) => !allowedFields.has(key))) return null;
  if (!Object.entries(fields).every(([key, check]) => check(body[key]))) return null;
  return {
    ...body,
    message: clean(body.message),
    page: cleanPage(body.page),
    appVersion: clean(body.appVersion),
    viewport: body.viewport ? clean(body.viewport) || null : null,
  };
}

export function validatePageLimit(value) {
  if (value === null) return 50;
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return Math.min(100, number);
}

export function validateSince(value) {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function validateCursor(value) {
  if (value === null) return undefined;
  if (!/^(0|[1-9]\d*):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return null;
  const time = Number(value.slice(0, value.indexOf(':')));
  return Number.isSafeInteger(time) ? { time, id: value.slice(value.indexOf(':') + 1) } : null;
}

export const isCategory = (value) => CATEGORIES.has(value);
export const isTarget = (value) => TARGETS.has(value);
