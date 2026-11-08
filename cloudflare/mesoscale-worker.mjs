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

const staleThresholdMinutes = (env) => {
  const configured = Number(env.STALE_AFTER_MINUTES ?? 180);
  return Number.isFinite(configured) && configured >= 0 ? configured : 180;
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
  if (raw.some(isUnsafePathSegment)) return null;
  return raw;
};

const isUnsafePathSegment = (part) => !part || /[%\\]|^\.{1,2}$/.test(part);

const parseCatalogRoute = (parts) => {
  if (parts.length !== 3) return null;
  if (parts[0] !== 'catalog' || !MODELS.has(parts[1])) return null;
  if (!/^\d{8}T\d{4}Z\.json$/.test(parts[2])) return null;
  const cycle = parts[2].slice(0, -5);
  return cycleDate(cycle) ? { kind: 'catalog', model: parts[1], cycle, key: `mesoscale/v1/catalog/${parts[1]}/${cycle}.json` } : null;
};

const parseLatestRoute = (parts) => {
  if (parts.length !== 2) return null;
  if (parts[0] !== 'latest' || !parts[1].endsWith('.json')) return null;
  const model = parts[1].slice(0, -5);
  return MODELS.has(model) ? { kind: 'latest', model, key: `mesoscale/v1/latest/${model}.json` } : null;
};

const validTileCoordinates = (zoom, x, y) => {
  if (zoom > MAX_ZOOM) return false;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false;
  return x < 2 ** zoom && y < 2 ** zoom;
};

const parseTileCoordinates = (parts) => {
  const [zoomText, xText, yFile] = parts;
  if (!/^(?:0|[1-9]\d?)$/.test(zoomText)) return null;
  if (!/^(?:0|[1-9]\d*)$/.test(xText)) return null;
  if (!/^(?:0|[1-9]\d*)\.png$/.test(yFile)) return null;
  const zoom = Number(zoomText);
  const x = Number(xText);
  const y = Number(yFile.slice(0, -4));
  return validTileCoordinates(zoom, x, y) ? { zoom, x, y } : null;
};

const parseTileRoute = (parts) => {
  if (parts.length !== 8) return null;
  if (parts[0] !== 'tiles' || !MODELS.has(parts[1])) return null;
  if (!cycleDate(parts[2])) return null;
  if (!/^f\d{2}$/.test(parts[3])) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[4])) return null;
  const coordinates = parseTileCoordinates(parts.slice(5));
  if (!coordinates) return null;
  const { zoom, x, y } = coordinates;
  return { kind: 'tile', key: `mesoscale/v1/tiles/${parts[1]}/${parts[2]}/${parts[3]}/${parts[4]}/${zoom}/${x}/${y}.png` };
};

const parseRoute = (pathname) => {
  const parts = pathSegments(pathname);
  if (!parts) return null;
  if (parts.length === 1 && parts[0] === 'status') return { kind: 'status' };
  return parseCatalogRoute(parts) || parseLatestRoute(parts) || parseTileRoute(parts);
};

const allowedOrigins = (env) => new Set((env.CORS_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));

const responseCors = (response, origin, allowed) => {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  if (origin && allowed.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Expose-Headers', 'ETag, Cache-Control, X-Mesoscale-Stale, X-Mesoscale-Age-Minutes');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const publicBaseUrl = (env) => {
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:') throw new Error('PUBLIC_BASE_URL must use HTTPS');
  if (base.origin !== env.PUBLIC_BASE_URL.replace(/\/$/, '')) throw new Error('PUBLIC_BASE_URL must be an origin without a path');
  return base;
};

const publicRepresentationEtag = (etag, env) => {
  if (!etag || !env.PUBLIC_BASE_URL) return etag;
  const encoded = btoa(`${etag}|${publicBaseUrl(env).origin}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `W/"${encoded}"`;
};

const noBodyForHead = (response) => new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });

const rewriteParameterTemplate = (parameter, base) => {
  if (parameter?.data?.type !== 'xyz-raster') return;
  if (typeof parameter.data.urlTemplate !== 'string') throw new Error('Catalog raster template is missing');
  const match = parameter.data.urlTemplate.match(/\/tiles\/([^/]+\/[^/]+\/f\d{2}\/[^/]+\/\{z\}\/\{x\}\/\{y\}\.png)$/);
  if (!match) throw new Error('Catalog raster template does not match the tile route');
  parameter.data.urlTemplate = `${base.origin}/tiles/${match[1]}`;
};

const addConfiguredTemplateBase = (catalog, env) => {
  if (!env.PUBLIC_BASE_URL) return catalog;
  const base = publicBaseUrl(env);
  for (const frame of catalog.frames || []) (frame.parameters || []).forEach((parameter) => rewriteParameterTemplate(parameter, base));
  return catalog;
};

const malformedJsonResponse = () => json({ error: 'Stored mesoscale JSON is malformed.' }, 502, { 'Cache-Control': 'no-store' });
const invalidCatalogResponse = () => json({ error: 'Stored catalog does not match its immutable key or schema.' }, 502, { 'Cache-Control': 'no-store' });
const storedJsonForRoute = (context) => {
  if (context.route.kind === 'catalog') return catalogResponse(context);
  return latestResponse(context);
};

const isJsonObject = (value) => {
  if (!value) return false;
  if (typeof value !== 'object') return false;
  return !Array.isArray(value);
};

const validCatalogIdentity = (value, route) => {
  if (value.model?.id !== route.model) return false;
  if (value.cycleTime !== cycleDate(route.cycle)) return false;
  return true;
};

const validCatalogContent = (value) => {
  const domain = value.domain;
  if (value.status !== 'complete') return false;
  if (!Array.isArray(value.frames)) return false;
  if (!domain || !Number.isInteger(domain.minZoom) || !Number.isInteger(domain.maxZoom)) return false;
  if (domain.minZoom < 0 || domain.maxZoom > MAX_ZOOM) return false;
  return domain.minZoom <= domain.maxZoom;
};

const validCatalog = (value, route) => {
  if (value.schemaVersion !== 1) return false;
  if (!validCatalogIdentity(value, route)) return false;
  return validCatalogContent(value);
};

const catalogResponse = ({ value, request, env, route, headers, etag }) => {
  if (!validCatalog(value, route)) return invalidCatalogResponse();
  try {
    addConfiguredTemplateBase(value, env);
  } catch {
    return json({ error: 'Mesoscale public URL is not configured correctly.' }, 503, { 'Cache-Control': 'no-store' });
  }
  headers.set('ETag', publicRepresentationEtag(etag, env));
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (matchesEtag(request.headers.get('If-None-Match'), headers.get('ETag'))) return new Response(null, { status: 304, headers });
  return new Response(JSON.stringify(value), { headers });
};

const validLatestPointer = (value, route, cycle) => {
  if (value.schemaVersion !== 1 || value.modelId !== route.model || !cycle) return false;
  return typeof value.publishedAt === 'string' && Number.isFinite(Date.parse(value.publishedAt));
};

const addLatestCatalogUrl = (value, env, route, cycle) => {
  if (!env.PUBLIC_BASE_URL) return true;
  try {
    value.catalogUrl = `${publicBaseUrl(env).origin}/catalog/${route.model}/${cycle}.json`;
    return true;
  } catch {
    return false;
  }
};

const latestResponse = ({ value, request, env, route, now, headers, etag }) => {
  const cycle = compactCycleFromIso(value.cycleTime);
  if (!validLatestPointer(value, route, cycle)) return json({ error: 'Stored latest pointer is malformed.' }, 502, { 'Cache-Control': 'no-store' });
  const age = ageMinutes(value.cycleTime, now);
  const stale = age === null || age > staleThresholdMinutes(env);
  headers.set('X-Mesoscale-Age-Minutes', age === null ? 'unknown' : String(age));
  headers.set('X-Mesoscale-Stale', String(stale));
  if (!addLatestCatalogUrl(value, env, route, cycle)) return json({ error: 'Mesoscale public URL is not configured correctly.' }, 503, { 'Cache-Control': 'no-store' });
  headers.set('ETag', publicRepresentationEtag(etag, env));
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (matchesEtag(request.headers.get('If-None-Match'), headers.get('ETag'))) return new Response(null, { status: 304, headers });
  return new Response(JSON.stringify(value), { headers });
};

const storedJsonResponse = async ({ request, env, route, object, now, headers, etag }) => {
  let value;
  try {
    value = await object.json();
  } catch {
    return malformedJsonResponse();
  }
  if (!isJsonObject(value)) return malformedJsonResponse();
  return storedJsonForRoute({ value, request, env, route, now, headers, etag });
};

const cacheControlForRoute = (route) => {
  if (route.kind === 'catalog') return `public, max-age=${CATALOG_TTL}, immutable`;
  if (route.kind === 'tile') return `public, max-age=${TILE_TTL}, immutable`;
  return `public, max-age=${POINTER_TTL}`;
};

const missingObjectResponse = (route) => {
  const ttl = route.kind === 'tile' ? TILE_MISS_TTL : POINTER_TTL;
  return new Response(null, { status: 404, headers: { 'Cache-Control': `public, max-age=${ttl}` } });
};

const conditionalResponse = (request, etag, headers) =>
  matchesEtag(request.headers.get('If-None-Match'), etag) ? new Response(null, { status: 304, headers }) : null;

const etagForText = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `"${hash}"`;
};

const jsonWithEtag = async (value, request, cacheControl) => {
  const body = JSON.stringify(value);
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl, ETag: await etagForText(body) });
  return conditionalResponse(request, headers.get('ETag'), headers) || new Response(body, { headers });
};

const catalogConditionalResponse = (request, etag, env, headers) => {
  try {
    const publicEtag = publicRepresentationEtag(etag, env);
    headers.set('ETag', publicEtag);
    return conditionalResponse(request, publicEtag, headers);
  } catch {
    return json({ error: 'Mesoscale public URL is not configured correctly.' }, 503, { 'Cache-Control': 'no-store' });
  }
};

const headersForObject = (route, object) => {
  const contentType = route.kind === 'tile' ? 'image/png' : object.httpMetadata?.contentType;
  const headers = new Headers(contentType ? { 'Content-Type': contentType } : {});
  const etag = object.httpEtag || object.etag;
  if (etag) headers.set('ETag', etag);
  headers.set('Cache-Control', cacheControlForRoute(route));
  return { headers, etag };
};

const objectConditionalResponse = ({ request, env, route, headers, etag }) => {
  if (route.kind === 'catalog') return catalogConditionalResponse(request, etag, env, headers);
  if (route.kind === 'tile') return conditionalResponse(request, etag, headers);
  return null;
};

const objectBodyResponse = ({ request, env, route, object, now, headers, etag }) => {
  if (route.kind === 'tile') return new Response(request.method === 'HEAD' ? null : object.body, { headers });
  return storedJsonResponse({ request, env, route, object, now, headers, etag });
};

const responseForObject = (context) => {
  const { headers, etag } = headersForObject(context.route, context.object);
  const conditional = objectConditionalResponse({ ...context, headers, etag });
  if (conditional) return conditional;
  return objectBodyResponse({ ...context, headers, etag });
};

const getObjectResponse = async (request, env, route, now) => {
  const bucket = env.MESOSCALE_BUCKET;
  if (!bucket || typeof bucket.get !== 'function') return json({ error: 'Mesoscale storage is not configured.' }, 503, { 'Cache-Control': 'no-store' });
  const object = await bucket.get(route.key);
  if (!object) return missingObjectResponse(route);
  return responseForObject({ request, env, route, object, now });
};

const readJson = async (bucket, key) => {
  const object = await bucket.get(key);
  if (!object) return { state: 'missing', value: null };
  try {
    const value = await object.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { state: 'invalid', value: null };
    return { state: 'ok', value };
  } catch {
    return { state: 'invalid', value: null };
  }
};

const healthForModel = (today, yesterday, modelId) => {
  if (today.state === 'ok' && today.value.modelId === modelId) return today.value;
  if (yesterday.state === 'ok' && yesterday.value.modelId === modelId) return yesterday.value;
  return null;
};

const validStatusPointer = (pointer, modelId) => {
  if (pointer.state !== 'ok') return false;
  if (pointer.value.schemaVersion !== 1) return false;
  if (pointer.value.modelId !== modelId || typeof pointer.value.cycleTime !== 'string') return false;
  return Number.isFinite(Date.parse(pointer.value.cycleTime));
};

const modelHealthState = (health, today, yesterday, pointer) => {
  if (health) return health.status;
  if ([today, yesterday, pointer].some((record) => record.state === 'invalid')) return 'invalid';
  return 'missing';
};

const modelStatus = async ({ bucket, modelId, day, previousDay, now, staleAfter }) => {
  const [pointer, today, yesterday] = await Promise.all([
    readJson(bucket, `mesoscale/v1/latest/${modelId}.json`),
    readJson(bucket, `mesoscale/v1/health/${day}/${modelId}.json`),
    readJson(bucket, `mesoscale/v1/health/${previousDay}/${modelId}.json`),
  ]);
  const health = healthForModel(today, yesterday, modelId);
  const validPointer = validStatusPointer(pointer, modelId);
  const pointerValue = validPointer ? pointer.value : null;
  const age = pointerValue ? ageMinutes(pointerValue.cycleTime, now) : null;
  const healthState = modelHealthState(health, today, yesterday, pointer);
  return { modelId, latestCycleTime: pointerValue?.cycleTime || null, ageMinutes: age, stale: age === null || age > staleAfter, health: healthState, healthGeneratedAt: health?.generatedAt || null };
};

const statusResponse = async (request, env, now) => {
  const bucket = env.MESOSCALE_BUCKET;
  if (!bucket || typeof bucket.get !== 'function') return json({ error: 'Mesoscale storage is not configured.' }, 503, { 'Cache-Control': 'no-store' });
  const day = new Date(now).toISOString().slice(0, 10);
  const previousDay = new Date(now - 86400000).toISOString().slice(0, 10);
  const staleAfter = staleThresholdMinutes(env);
  const models = await Promise.all([...MODELS].map((modelId) => modelStatus({ bucket, modelId, day, previousDay, now, staleAfter })));
  const healthy = models.every((model) => model.health === 'complete' && !model.stale);
  return jsonWithEtag({ generatedAt: new Date(now).toISOString(), status: healthy ? 'healthy' : 'degraded', models }, request, `public, max-age=${STATUS_TTL}`);
};

const fetchUncached = (request, route, env, now) => route.kind === 'status' ? statusResponse(request, env, now) : getObjectResponse(request, env, route, now);

const cacheKeyFor = (request) => {
  const url = new URL(request.url);
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
};

const cacheHitResponse = (request, response) => {
  const etag = response.headers.get('ETag');
  return matchesEtag(request.headers.get('If-None-Match'), etag)
    ? new Response(null, { status: 304, headers: response.headers })
    : response;
};

const applyHeadMethod = (request, response) => request.method === 'HEAD' ? noBodyForHead(response) : response;

const cacheStoreResponse = async (cache, key, response) => {
  if (![200, 404].includes(response.status) || !response.headers.get('Cache-Control')?.includes('max-age=')) return;
  try {
    await cache.put(key, response.clone());
  } catch {
    // Cache API availability does not affect the R2 response.
  }
};

const cachedFetch = async (request, route, env, now) => {
  const cache = globalThis.caches?.default;
  if (!['GET', 'HEAD'].includes(request.method) || !cache) return fetchUncached(request, route, env, now);
  const key = cacheKeyFor(request);
  const hit = await cache.match(key);
  if (hit) return applyHeadMethod(request, cacheHitResponse(request, hit));
  const getRequest = request.method === 'HEAD' ? new Request(request.url, { method: 'GET', headers: request.headers }) : request;
  const response = await fetchUncached(getRequest, route, env, now);
  await cacheStoreResponse(cache, key, response);
  return applyHeadMethod(request, response);
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
