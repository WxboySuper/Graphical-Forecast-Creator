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
  if (!Number.isFinite(parsed)) return null;
  if (parsed > now) return null;
  return Math.floor((now - parsed) / 60000);
};

const staleThresholdMinutes = (env) => {
  const value = env.STALE_AFTER_MINUTES?.trim();
  if (!value) return 180;
  const configured = Number(value);
  return Number.isFinite(configured) && configured >= 0 ? configured : 180;
};

const matchesEtag = (header, etag) => {
  if (!header || !etag) return false;
  const opaque = (value) => value.replace(/^W\//, '');
  return header.split(',').map((value) => value.trim()).some((value) => value === '*' || opaque(value) === opaque(etag));
};

const cycleDate = (cycle) => {
  if (!/^\d{8}T\d{4}Z$/.test(cycle)) return null;
  if (cycle.slice(11, 13) !== '00') return null;
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
  // WHATWG URL parsing normalizes dot-segments before fetch sees pathname; reject percent escapes, empty segments, and backslashes explicitly before routing.
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
  const vary = headers.get('Vary');
  if (!vary?.split(',').map((value) => value.trim().toLowerCase()).includes('origin')) {
    headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  }
  if (origin && allowed.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
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
  const value = `${etag}|${publicBaseUrl(env).origin}`;
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `W/"${encoded}"`;
};

const noBodyForHead = (response) => new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });

const rewriteParameterTemplate = (parameter, base, route) => {
  if (parameter?.data?.type !== 'xyz-raster') return;
  if (typeof parameter.data.urlTemplate !== 'string') throw new Error('Catalog raster template is missing');
  const match = parameter.data.urlTemplate.match(/\/tiles\/([^/]+\/[^/]+\/f\d{2}\/[^/]+\/\{z\}\/\{x\}\/\{y\}\.png)$/);
  if (!match) throw new Error('Catalog raster template does not match the tile route');
  const [model, cycle, hour, parameterId] = match[1].split('/');
  if (model !== route.model) throw new Error('Catalog raster template does not match its immutable key');
  if (cycle !== route.cycle) throw new Error('Catalog raster template does not match its immutable key');
  if (!/^f\d{2}$/.test(hour)) throw new Error('Catalog raster template does not match its immutable key');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parameterId)) throw new Error('Catalog raster template does not match its immutable key');
  parameter.data.urlTemplate = `${base.origin}/tiles/${match[1]}`;
};

const addConfiguredTemplateBase = (catalog, base, route) => {
  for (const frame of catalog.frames) frame.parameters.forEach((parameter) => rewriteParameterTemplate(parameter, base, route));
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

const validCatalogParameter = (parameter, route, expectedHour) => {
  if (!isJsonObject(parameter)) return false;
  if (typeof parameter.id !== 'string') return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parameter.id)) return false;
  if (!isJsonObject(parameter.data)) return false;
  if (parameter.data.type !== 'xyz-raster') return false;
  if (typeof parameter.data.urlTemplate !== 'string') return false;
  const match = parameter.data.urlTemplate.match(/\/tiles\/([^/]+\/[^/]+\/f\d{2}\/[^/]+\/\{z\}\/\{x\}\/\{y\}\.png)$/);
  if (!match) return false;
  const [model, cycle, hour, parameterId] = match[1].split('/');
  if (model !== route.model) return false;
  if (cycle !== route.cycle) return false;
  if (!cycleDate(cycle)) return false;
  if (hour !== expectedHour) return false;
  return parameterId === parameter.id;
};

const validCatalogIdentity = (value, route) => {
  if (value.model?.id !== route.model) return false;
  if (value.cycleTime !== cycleDate(route.cycle)) return false;
  return true;
};

const validCatalogFrame = (frame, route) => {
  if (!isJsonObject(frame)) return false;
  if (!Number.isInteger(frame.forecastHour)) return false;
  if (frame.forecastHour < 0) return false;
  if (frame.forecastHour > 99) return false;
  if (!Array.isArray(frame.parameters)) return false;
  const expectedHour = `f${String(frame.forecastHour).padStart(2, '0')}`;
  return frame.parameters.every((parameter) => validCatalogParameter(parameter, route, expectedHour));
};

const validCatalogFrames = (frames, route) => {
  if (!Array.isArray(frames)) return false;
  if (frames.length === 0) return false;
  return frames.every((frame) => validCatalogFrame(frame, route));
};

const validCatalogDomain = (domain) => {
  if (!isJsonObject(domain)) return false;
  if (!Number.isInteger(domain.minZoom)) return false;
  if (!Number.isInteger(domain.maxZoom)) return false;
  if (domain.minZoom < 0) return false;
  if (domain.maxZoom > MAX_ZOOM) return false;
  return domain.minZoom <= domain.maxZoom;
};

const validCatalogContent = (value, route) => {
  if (value.status !== 'complete') return false;
  if (!validCatalogFrames(value.frames, route)) return false;
  return validCatalogDomain(value.domain);
};

const validCatalog = (value, route) => {
  if (value.schemaVersion !== 1) return false;
  if (!validCatalogIdentity(value, route)) return false;
  return validCatalogContent(value, route);
};

const catalogResponse = ({ value, request, env, route, headers, etag }) => {
  if (!validCatalog(value, route)) return invalidCatalogResponse();
  let base;
  try {
    if (env.PUBLIC_BASE_URL) base = publicBaseUrl(env);
  } catch {
    return json({ error: 'Mesoscale public URL is not configured correctly.' }, 503, { 'Cache-Control': 'no-store' });
  }
  try {
    if (base) addConfiguredTemplateBase(value, base, route);
  } catch {
    return invalidCatalogResponse();
  }
  const publicEtag = publicRepresentationEtag(etag, env);
  if (publicEtag) headers.set('ETag', publicEtag);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (publicEtag && matchesEtag(request.headers.get('If-None-Match'), publicEtag)) return new Response(null, { status: 304, headers });
  return new Response(JSON.stringify(value), { headers });
};

const validLatestPointer = (value, route, cycle) => {
  if (value.schemaVersion !== 1) return false;
  if (value.modelId !== route.model) return false;
  if (!cycle) return false;
  if (compactCycleFromIso(value.cycleTime) !== cycle) return false;
  if (typeof value.catalogUrl !== 'string') return false;
  if (typeof value.publishedAt !== 'string') return false;
  return Number.isFinite(Date.parse(value.publishedAt));
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
  const publicEtag = publicRepresentationEtag(etag, env);
  if (publicEtag) headers.set('ETag', publicEtag);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (publicEtag && matchesEtag(request.headers.get('If-None-Match'), publicEtag)) return new Response(null, { status: 304, headers });
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
    if (publicEtag) headers.set('ETag', publicEtag);
    return conditionalResponse(request, publicEtag, headers);
  } catch {
    return json({ error: 'Mesoscale public URL is not configured correctly.' }, 503, { 'Cache-Control': 'no-store' });
  }
};

const headersForObject = (route, object) => {
  const jsonType = route.kind === 'catalog' || route.kind === 'latest' ? 'application/json; charset=utf-8' : null;
  const contentType = route.kind === 'tile' ? 'image/png' : object.httpMetadata?.contentType || jsonType;
  const headers = new Headers(contentType ? { 'Content-Type': contentType } : {});
  if (route.kind === 'tile' && Number.isSafeInteger(object.size)) headers.set('Content-Length', String(object.size));
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
  if (request.method === 'HEAD' && route.kind === 'catalog') return new Response(null, { headers });
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
  const headTile = request.method === 'HEAD' && route.kind === 'tile' && typeof bucket?.head === 'function';
  if (!bucket || (!headTile && typeof bucket.get !== 'function')) return json({ error: 'Mesoscale storage is not configured.' }, 503, { 'Cache-Control': 'no-store' });
  const object = headTile
    ? await bucket.head(route.key)
    : await bucket.get(route.key);
  if (!object) return missingObjectResponse(route);
  return responseForObject({ request, env, route, object, now });
};

const readJson = async (bucket, key) => {
  let object;
  try {
    object = await bucket.get(key);
  } catch {
    return { state: 'invalid', value: null };
  }
  if (!object) return { state: 'missing', value: null };
  try {
    const value = await object.json();
    if (!value) return { state: 'invalid', value: null };
    if (typeof value !== 'object') return { state: 'invalid', value: null };
    if (Array.isArray(value)) return { state: 'invalid', value: null };
    return { state: 'ok', value };
  } catch {
    return { state: 'invalid', value: null };
  }
};

const validateJsonRecord = (record, isValid) => {
  if (record.state !== 'ok') return record;
  return isValid(record.value) ? record : { state: 'invalid', value: null };
};

const validStatusPointerValue = (value, modelId) => {
  if (value.schemaVersion !== 1) return false;
  if (value.modelId !== modelId) return false;
  if (!compactCycleFromIso(value.cycleTime)) return false;
  if (typeof value.catalogUrl !== 'string') return false;
  if (typeof value.publishedAt !== 'string') return false;
  return Number.isFinite(Date.parse(value.publishedAt));
};

const validHealthValue = (value, modelId) => {
  if (value.schemaVersion !== 1) return false;
  if (value.modelId !== modelId) return false;
  if (!['complete', 'partial', 'failed'].includes(value.status)) return false;
  if (typeof value.generatedAt !== 'string') return false;
  return Number.isFinite(Date.parse(value.generatedAt));
};

const healthForModel = (today, yesterday) => {
  if (today.state === 'ok') return today.value;
  // A corrupt current-day object should stay visible instead of being masked by yesterday's record.
  if (today.state === 'invalid') return null;
  if (yesterday.state === 'ok') return yesterday.value;
  return null;
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
  const validPointer = validateJsonRecord(pointer, (value) => validStatusPointerValue(value, modelId));
  const validToday = validateJsonRecord(today, (value) => validHealthValue(value, modelId));
  const validYesterday = validateJsonRecord(yesterday, (value) => validHealthValue(value, modelId));
  const health = healthForModel(validToday, validYesterday);
  const pointerValue = validPointer.state === 'ok' ? validPointer.value : null;
  const age = pointerValue ? ageMinutes(pointerValue.cycleTime, now) : null;
  const healthState = modelHealthState(health, validToday, validYesterday, validPointer);
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
  return jsonWithEtag({ status: healthy ? 'healthy' : 'degraded', models }, request, `public, max-age=${STATUS_TTL}`);
};

const fetchUncached = (request, route, env, now) => route.kind === 'status' ? statusResponse(request, env, now) : getObjectResponse(request, env, route, now);

const cacheKeyFor = (request, env, route) => {
  const url = new URL(request.url);
  url.search = '';
  if (route.kind === 'catalog' || route.kind === 'latest') url.searchParams.set('__public_base', env.PUBLIC_BASE_URL || '');
  return new Request(url.toString(), { method: 'GET' });
};

const cacheHitResponse = (request, response) => {
  const etag = response.headers.get('ETag');
  return matchesEtag(request.headers.get('If-None-Match'), etag)
    ? new Response(null, { status: 304, headers: response.headers })
    : response;
};

const applyHeadMethod = (request, response) => request.method === 'HEAD' ? noBodyForHead(response) : response;

const cacheStoreResponse = async (cache, key, response, context) => {
  if (![200, 404].includes(response.status) || !response.headers.get('Cache-Control')?.includes('max-age=')) return;
  const put = cache.put(key, response.clone()).catch(() => {});
  if (context?.waitUntil) context.waitUntil(put);
  else await put;
};

const cachedFetch = async (request, route, env, now, context) => {
  const cache = globalThis.caches?.default;
  if (!['GET', 'HEAD'].includes(request.method) || !cache) return fetchUncached(request, route, env, now);
  const key = cacheKeyFor(request, env, route);
  let hit;
  try {
    hit = await cache.match(key);
  } catch {
    return fetchUncached(request, route, env, now);
  }
  if (hit) return applyHeadMethod(request, cacheHitResponse(request, hit));
  const response = await fetchUncached(request, route, env, now);
  if (request.method === 'GET') await cacheStoreResponse(cache, key, response, context);
  return applyHeadMethod(request, response);
};

export default {
  async fetch(request, env, context) {
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
      let response = await cachedFetch(request, route, env, now, context);
      if (request.method === 'HEAD') response = noBodyForHead(response);
      return responseCors(response, origin, allowed);
    } catch {
      return responseCors(json({ error: 'Mesoscale storage is temporarily unavailable.' }, 502, { 'Cache-Control': 'no-store' }), origin, allowed);
    }
  },
};
