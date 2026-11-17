const parseJson = (value) => {
  try { return JSON.parse(value); } catch { return null; }
};

// Keep byte limits in JavaScript in one place; mirror this value in D1 CHECKs.
const MAX_CYCLE_BYTES = 750_000;

const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const mapStripeInterval = (subscription) => {
  const interval = subscription?.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === 'year') return 'annual';
  if (interval === 'month') return 'monthly';
  return null;
};
const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const timingSafeStringEqual = async (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(left)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
};
const tokenCacheKey = async (subject, token) => `${subject}:${await sha256Hex(token)}`;
const decodePathId = (value) => {
  try { return decodeURIComponent(value); } catch { return null; }
};
const readBearer = (request) => {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
};
async function verifyStripeSignature(payload, header, secret) {
  const { timestamp, signatures } = parseStripeSignatureHeader(header);
  if (!timestamp || signatures.length === 0) return false;
  const expected = await createStripeSignature(payload, timestamp, secret);
  return (await Promise.all(signatures.map((signature) => timingSafeStringEqual(expected, signature)))).some(Boolean)
    && isFreshStripeTimestamp(timestamp);
}

function parseStripeSignatureHeader(header) {
  const parts = (header || '').split(',').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim().replace(/^"|"$/g, '')];
  });
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key, value]) => key === 'v1' && value).map(([, value]) => value);
  if (!/^\d+$/.test(timestamp || '')) return { timestamp: null, signatures: [] };
  return { timestamp, signatures };
}

async function createStripeSignature(payload, timestamp, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isFreshStripeTimestamp(timestamp) {
  const age = Date.now() / 1000 - Number(timestamp);
  return age >= 0 && age <= 300;
}

async function readLimitedBody(request, limit) {
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > limit) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export { MAX_CYCLE_BYTES, decodePathId, isObject, json, mapStripeInterval, normalizeEmail, parseJson, readBearer, readLimitedBody, sha256Hex, timingSafeStringEqual, tokenCacheKey, verifyStripeSignature };
