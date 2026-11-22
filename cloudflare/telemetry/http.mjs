import { json } from '../feedback/response.mjs';

const BODY_LIMIT = 2048;

export function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.TELEMETRY_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

// Body-less pings (/v1/visit, /v1/active) are sent by the app and marketing site without a Content-Type,
// so those routes accept a missing header; the payload is still checked to be empty.
export function requestError(request, headers, { allowMissingContentType = false } = {}) {
  if (request.headers.has('origin') && !headers['access-control-allow-origin']) return json({ error: 'Origin not allowed' }, 403);
  const contentType = (request.headers.get('content-type') ?? '').trim();
  const missingAllowed = allowMissingContentType && contentType === '';
  if (!missingAllowed && !/^application\/json\s*(?:;|$)/i.test(contentType)) return json({ error: 'Content-Type must be application/json' }, 400, headers);
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > BODY_LIMIT) return json({ error: 'Request body too large' }, 413, headers);
  return null;
}

async function readLimitedBody(request, headers) {
  const reader = request.body?.getReader();
  if (!reader) return { text: '' };
  const chunks = [];
  let size = 0;
  while (true) {
    let result;
    try { result = await reader.read(); }
    catch { return { response: json({ error: 'Invalid JSON' }, 400, headers) }; }
    if (result.done) break;
    size += result.value.byteLength;
    if (size > BODY_LIMIT) {
      await reader.cancel();
      return { response: json({ error: 'Request body too large' }, 413, headers) };
    }
    chunks.push(result.value);
  }
  const text = decodeChunks(chunks, size, headers);
  return typeof text === 'string' ? { text } : text;
}

function decodeChunks(chunks, size, headers) {
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(joined); }
  catch { return { response: json({ error: 'Invalid JSON' }, 400, headers) }; }
}

function invalidJson(headers) {
  return { response: json({ error: 'Invalid JSON' }, 400, headers) };
}

function validJsonObject(body) {
  if (body === null) return false;
  if (Array.isArray(body)) return false;
  return typeof body === 'object';
}

function parseObject(text, headers) {
  let body;
  try {
    body = JSON.parse(text || '{}');
  } catch { return invalidJson(headers); }
  if (!validJsonObject(body)) return invalidJson(headers);
  return { body };
}

export async function parseJson(request, headers) {
  const limited = await readLimitedBody(request, headers);
  if (limited.response) return limited;
  return parseObject(limited.text, headers);
}

export async function emptyObject(request, headers) {
  const parsed = await parseJson(request, headers);
  if (parsed.response) return parsed;
  if (Object.keys(parsed.body).length) return { response: json({ error: 'Invalid payload' }, 400, headers) };
  return parsed;
}
