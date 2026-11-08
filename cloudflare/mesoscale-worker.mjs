const MODELS = new Set(['hrrr', 'rap', 'rrfs']);
const MAX_ZOOM = 24;
const TILE_MISS_TTL = 60;
const POINTER_TTL = 30;
const STATUS_TTL = 30;
const CATALOG_TTL = 31536000;
const TILE_TTL = 31536000;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

const ageMinutes = (timestamp, now) => {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 60000)) : null;
};

const matchesEtag = (header, etag) => {
  if (!header || !etag) return false;
  const opaque = (value) => value.replace(/^W\//, '');
  return header.split(',').map((value) => value.trim()).some((value) => value === '*' || opaque(value) === opaque(etag));
};

const cycleDate = (cycle) => {
  if (!/^\d{8}T\d{4}Z$/.test(cycle)) return null;
  const value = `${cycle.slice(0, 4)}-${cycle.slice(4, 6)}-${cycle.slice(6, 8)}T${cycle.slice(9, 11)}:${cycle.slice(11, 13)}:00Z`;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().replace('.000Z', 'Z') === value ? value : null;
};

const compactCycleFromIso = (value) => {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00(?:\.000)?Z$/);
  if (!match) return null;
  const cycle = `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}Z`;
  return cycleDate(cycle) ? cycle : null;
};

const pathSegments = (pathname) => {
  const raw = pathname.split('/').slice(1);
  if (raw.some((part) => !part || part.includes('%') || part.includes('\\') || part === '.' || part === '..')) return null;
  return raw;
};

const parseRoute = (pathname) => {
  const parts = pathSegments(pathname);
  if (!parts) return null;
  if (parts.length === 3 && parts[0] === 'catalog' && MODELS.has(parts[1]) && /^\d{8}T\d{4}Z\.json$/.test(parts[2])) {
    const cycle = parts[2].slice(0, -5);
    return cycleDate(cycle) ? { kind: 'catalog', model: parts[1], cycle, key: `mesoscale/v1/catalog/${parts[1]}/${cycle}.json` } : null;
  }
  if (parts.length === 2 && parts[0] === 'latest' && parts[1].endsWith('.json')) {
    const model = parts[1].slice(0, -5);
    return MODELS.has(model) ? { kind: 'latest', model, key: `mesoscale/v1/latest/${model}.json` } : null;
  }
  if (parts.length === 8 && parts[0] === 'tiles' && MODELS.has(parts[1]) && cycleDate(parts[2]) && /^f\d{2}$/.test(parts[3]) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[4])) {
    const [zText, xText, yFile] = parts.slice(5);
    if (!/^(?:0|[1-9]\d?)$/.test(zText) || !/^(?:0|[1-9]\d*)$/.test(xText) || !/^(?:0|[1-9]\d*)\.png$/.test(yFile)) return null;
    const z = Number(zText);
    const x = Number(xText);
    const y = Number(yFile.slice(0, -4));
    if (z > MAX_ZOOM || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x >= 2 ** z || y >= 2 ** z) return null;
    return { kind: 'tile', key: `mesoscale/v1/tiles/${parts[1]}/${parts[2]}/${parts[3]}/${parts[4]}/${z}/${x}/${y}.png` };
  }
  if (parts.length === 1 && parts[0] === 'status') return { kind: 'status' };
  return null;
};

const allowedOrigins = (env) => new Set((env.CORS_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));

const responseCors = (response, origin, allowed) => {
  const headers = new Headers(response.headers);
  if (origin && allowed.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Expose-Headers', 'ETag, Cache-Control, X-Mesoscale-Stale, X-Mesoscale-Age-Minutes');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const publicBaseUrl = (env) => {
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('PUBLIC_BASE_URL must be a public HTTPS URL');
  return base;
};

const noBodyForHead = (response) => new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });

const addConfiguredTemplateBase = (catalog, env) => {
  if (!env.PUBLIC_BASE_URL) return catalog;
  let base;
  try {
    base = publicBaseUrl(env);
  } catch {
    throw new Error('PUBLIC_BASE_URL is invalid');
  }
  const prefix = `${base.origin}${base.pathname.replace(/\/$/, '')}`;
  for (const frame of catalog.frames || []) {
    for (const parameter of frame.parameters || []) {
      if (parameter?.data?.type === 'xyz-raster' && typeof parameter.data.urlTemplate === 'string') {
        const match = parameter.data.urlTemplate.match(/\/tiles\/([^/]+\/[^/]+\/f\d{2}\/[^/]+\/\{z\}\/\{x\}\/\{y\}\.png)$/);
        if (match) parameter.data.urlTemplate = `${prefix}/tiles/${match[1]}`;
      }
    }
  }
  return catalog;
};

const malformedJsonResponse = () => json({ error: 'Stored mesoscale JSON is malformed.' }, 502, { 'Cache-Control': 'no-store' });

const catalogResponse = (value, request, env, route, headers, etag) => {
  const domain = value.domain;
  const invalid = value.schemaVersion !== 1 || value.model?.id !== route.model || value.cycleTime !== cycleDate(route.cycle) || value.status !== 'complete' || !Array.isArray(value.frames) || !domain || !Number.isInteger(domain.minZoom) || !Number.isInteger(domain.maxZoom) || domain.minZoom < 0 || domain.maxZoom > MAX_ZOOM || domain.minZoom > domain.maxZoom;
  if (invalid) return json({ error: 'Stored catalog does not match its immutable key or schema.' }, 502, { 'Cache-Control': 'no-store' });
  try {
    addConfiguredTemplateBase(value, env);
  } catch {
    return json({ error: 'Mesoscale public URL is not configured correctly.' }, 503, { 'Cache-Control': 'no-store' });
  }
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (matchesEtag(request.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers });
  return new Response(JSON.stringify(value), { headers });
};

const latestResponse = (value, request, env, route, now, headers, etag) => {
  const cycle = compactCycleFromIso(value.cycleTime);
  if (value.schemaVersion !== 1 || value.modelId !== route.model || !cycle || typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt))) return json({ error: 'Stored latest pointer is malformed.' }, 502, { 'Cache-Control': 'no-store' });
  const age = ageMinutes(value.cycleTime, now);
  const stale = age === null || age > Number(env.STALE_AFTER_MINUTES || 180);
  headers.set('X-Mesoscale-Age-Minutes', age === null ? 'unknown' : String(age));
  headers.set('X-Mesoscale-Stale', String(stale));
  if (env.PUBLIC_BASE_URL) {
    try {
      const base = publicBaseUrl(env);
      value.catalogUrl = `${base.origin}${base.pathname.replace(/\/$/, '')}/catalog/${route.model}/${cycle}.json`;
    } catch {
      return json({ error: 'Mesoscale public URL is not configured correctly.' }, 503, { 'Cache-Control': 'no-store' });
    }
  }
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (matchesEtag(request.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers });
  return new Response(JSON.stringify(value), { headers });
};

const storedJsonResponse = async (request, env, route, object, now, headers, etag) => {
  let value;
  try {
    value = await object.json();
  } catch {
    return malformedJsonResponse();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return malformedJsonResponse();
  return route.kind === 'catalog'
    ? catalogResponse(value, request, env, route, headers, etag)
    : latestResponse(value, request, env, route, now, headers, etag);
};

const getObjectResponse = async (request, env, route, now) => {
  if (!env.MESOSCALE_BUCKET || typeof env.MESOSCALE_BUCKET.get !== 'function') return json({ error: 'Mesoscale storage is not configured.' }, 503, { 'Cache-Control': 'no-store' });
  const object = await env.MESOSCALE_BUCKET.get(route.key);
  if (!object) return new Response(null, { status: 404, headers: { 'Cache-Control': `public, max-age=${route.kind === 'tile' ? TILE_MISS_TTL : POINTER_TTL}` } });
  const headers = new Headers(object.httpMetadata?.contentType ? { 'Content-Type': object.httpMetadata.contentType } : {});
  const etag = object.httpEtag || object.etag;
  if (etag) headers.set('ETag', etag);
  headers.set('Cache-Control', route.kind === 'catalog' || route.kind === 'tile' ? `public, max-age=${route.kind === 'catalog' ? CATALOG_TTL : TILE_TTL}, immutable` : `public, max-age=${POINTER_TTL}`);
  if (route.kind === 'tile' && matchesEtag(request.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers });
  if (route.kind !== 'tile') return storedJsonResponse(request, env, route, object, now, headers, etag);
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
};

const readJson = async (bucket, key) => {
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    const value = await object.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

const statusResponse = async (env, now) => {
  if (!env.MESOSCALE_BUCKET || typeof env.MESOSCALE_BUCKET.get !== 'function') return json({ error: 'Mesoscale storage is not configured.' }, 503, { 'Cache-Control': 'no-store' });
  const day = new Date(now).toISOString().slice(0, 10);
  const previousDay = new Date(now - 86400000).toISOString().slice(0, 10);
  const models = await Promise.all([...MODELS].map(async (modelId) => {
    const [pointer, today, yesterday] = await Promise.all([
      readJson(env.MESOSCALE_BUCKET, `mesoscale/v1/latest/${modelId}.json`),
      readJson(env.MESOSCALE_BUCKET, `mesoscale/v1/health/${day}/${modelId}.json`),
      readJson(env.MESOSCALE_BUCKET, `mesoscale/v1/health/${previousDay}/${modelId}.json`),
    ]);
    const health = today?.modelId === modelId ? today : yesterday?.modelId === modelId ? yesterday : null;
    const validPointer = pointer?.schemaVersion === 1 && pointer.modelId === modelId && typeof pointer.cycleTime === 'string' && Number.isFinite(Date.parse(pointer.cycleTime));
    const age = validPointer ? ageMinutes(pointer.cycleTime, now) : null;
    const stale = age === null || age > Number(env.STALE_AFTER_MINUTES || 180);
    return { modelId, latestCycleTime: validPointer ? pointer.cycleTime : null, ageMinutes: age, stale, health: health?.status || (pointer ? 'invalid' : 'missing'), healthGeneratedAt: health?.generatedAt || null };
  }));
  const healthy = models.every((model) => model.health === 'complete' && !model.stale);
  return json({ generatedAt: new Date(now).toISOString(), status: healthy ? 'healthy' : 'degraded', models }, 200, { 'Cache-Control': `public, max-age=${STATUS_TTL}` });
};

const cachedFetch = async (request, route, env, now) => {
  const cache = globalThis.caches?.default;
  if (request.method !== 'GET' || !cache) return route.kind === 'status' ? statusResponse(env, now) : getObjectResponse(request, env, route, now);
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  let response = await cache.match(cacheKey);
  if (!response) {
    response = route.kind === 'status' ? await statusResponse(env, now) : await getObjectResponse(request, env, route, now);
    if ([200, 404].includes(response.status) && response.headers.get('Cache-Control')?.includes('max-age=')) {
      try {
        await cache.put(cacheKey, response.clone());
      } catch {
        // Cache API availability does not affect the R2 response.
      }
    }
  } else {
    const etag = response.headers.get('ETag');
    if (matchesEtag(request.headers.get('If-None-Match'), etag)) {
      return new Response(null, { status: 304, headers: response.headers });
    }
  }
  return response;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = allowedOrigins(env);
    if (request.method === 'OPTIONS') {
      if (origin && !allowed.has(origin)) return responseCors(new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } }), origin, allowed);
      const preflight = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'If-None-Match', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store' } });
      return responseCors(preflight, origin, allowed);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return responseCors(json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' }), origin, allowed);
    const route = parseRoute(url.pathname);
    if (!route) return responseCors(json({ error: 'Not found.' }, 404, { 'Cache-Control': 'no-store' }), origin, allowed);
    try {
      const now = Date.now();
      let response = await cachedFetch(request, route, env, now);
      if (request.method === 'HEAD') response = noBodyForHead(response);
      return responseCors(response, origin, allowed);
    } catch {
      return responseCors(json({ error: 'Mesoscale storage is temporarily unavailable.' }, 502, { 'Cache-Control': 'no-store' }), origin, allowed);
    }
  },
};
