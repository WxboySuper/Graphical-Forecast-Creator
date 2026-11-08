import { getMesoscaleClientConfig, type MesoscaleClientConfig } from '../config/mesoscale';
import { normalizeProviderPayload } from './normalizeProviderPayload';
import type { MesoscaleModelId, MesoscaleParameterResponse } from './contracts';
import type { MesoscaleCatalog, MesoscaleLatestPointer, MesoscaleStatus } from './catalogContracts';
import { readMesoscaleFixture } from './fixtures/client';
import { isRecord } from './providerPayloadValidation';

export interface RequestOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  config?: MesoscaleClientConfig;
}

export type MesoscaleRequestResult<T> =
  | { state: 'loading' }
  | { state: 'ready' | 'partial' | 'stale'; data: T; stale: boolean; ageMinutes: number | null }
  | { state: 'upstream-failure'; message: string; retryable: boolean }
  | { state: 'malformed'; message: string };

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;
const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

const combineSignal = (parent: AbortSignal | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) controller.abort();
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent?.removeEventListener('abort', abort); } };
};

async function fetchAttempt(url: string, options: RequestOptions): Promise<{ response: Response; cleanup: () => void }> {
  const request = combineSignal(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetcher ?? fetch)(url, { signal: request.signal, headers: { Accept: 'application/json' } });
    return { response, cleanup: request.cleanup };
  } catch (error) {
    request.cleanup();
    throw error;
  }
}

const retryCount = (options: RequestOptions): number => Math.max(0, Math.min(options.retries ?? DEFAULT_RETRIES, 3));

const pauseBeforeRetry = (attempt: number): Promise<void> => new Promise(resolve => setTimeout(resolve, 150 * (2 ** attempt)));

async function attemptWithRetry(url: string, options: RequestOptions, attempt: number, attempts: number) {
  try {
    const request = await fetchAttempt(url, options);
    if (request.response.ok) return request;
    if (request.response.status < 500) return request;
    if (attempt === attempts) return request;
    request.cleanup();
  } catch (error) {
    if (isAbort(error)) throw error;
    if (attempt === attempts) throw error;
  }
  return undefined;
}

async function fetchResponse(url: string, options: RequestOptions): Promise<{ response: Response; cleanup: () => void }> {
  const attempts = retryCount(options);
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const request = await attemptWithRetry(url, options, attempt, attempts);
    if (request) return request;
    await pauseBeforeRetry(attempt);
  }
  throw new Error('Mesoscale request failed.');
}

const endpoint = (config: MesoscaleClientConfig, path: string): string => `${config.baseUrl.replace(/\/$/, '')}/${path}`;

const readHttpJson = async <T,>(url: string, options: RequestOptions): Promise<MesoscaleRequestResult<T>> => {
  const request = await fetchResponse(url, options);
  const { response } = request;
  try {
    if (!response.ok) return { state: 'upstream-failure', message: `Mesoscale request failed (${response.status}).`, retryable: response.status >= 500 };
    const data = await response.json() as T;
    if (!isRecord(data)) return { state: 'malformed', message: 'Mesoscale response must be a JSON object.' };
    return readResponseMetadata(data, response.headers);
  } finally {
    request.cleanup();
  }
};

const readResponseMetadata = <T,>(data: T, headers: Headers): MesoscaleRequestResult<T> => {
  const rawAge = headers.get('X-Mesoscale-Age-Minutes');
  const age = rawAge === null ? Number.NaN : Number(rawAge);
  return {
    state: 'ready', data,
    stale: headers.get('X-Mesoscale-Stale') === 'true',
    ageMinutes: Number.isFinite(age) ? age : null,
  };
};

const getReadConfigFailure = (options: RequestOptions): MesoscaleRequestResult<never> | undefined => {
  if (options.signal?.aborted) return { state: 'upstream-failure', message: 'Request was cancelled.', retryable: false };
  const config = options.config ?? getMesoscaleClientConfig();
  if (!config.enabled) return { state: 'upstream-failure', message: 'Mesoscale is disabled for this build target.', retryable: false };
  return undefined;
};

async function readJson<T>(path: string, options: RequestOptions = {}): Promise<MesoscaleRequestResult<T>> {
  const failure = getReadConfigFailure(options);
  if (failure) return failure;
  const config = options.config ?? getMesoscaleClientConfig();
  if (config.fixtures) return readMesoscaleFixture<T>(path);
  try {
    return await readHttpJson<T>(endpoint(config, path), options);
  } catch (error) {
    if (isAbort(error)) return { state: 'upstream-failure', message: 'Mesoscale request timed out or was cancelled.', retryable: false };
    if (error instanceof SyntaxError) return { state: 'malformed', message: 'Mesoscale response is not valid JSON.' };
    return { state: 'upstream-failure', message: 'Mesoscale service is unavailable.', retryable: true };
  }
}

export const fetchMesoscaleLatest = (model: MesoscaleModelId, options?: RequestOptions) =>
  readJson<MesoscaleLatestPointer>(`latest/${model}.json`, options).then(result => {
    if (!hasData(result)) return result;
    const pointer = result.data;
    if (!isLatestPointer(pointer, model)) {
      return { state: 'malformed' as const, message: 'Latest pointer does not match the catalog contract.' };
    }
    return result.stale ? { ...result, state: 'stale' as const } : result;
  });

const malformed = (message: string): MesoscaleRequestResult<never> => ({ state: 'malformed', message });

const normalizedFailure = (values: MesoscaleParameterResponse[]): MesoscaleRequestResult<never> | undefined => {
  const invalid = values.find(value => value.state === 'malformed');
  if (invalid?.state === 'malformed') return malformed(invalid.message);
  const failed = values.find(value => value.state === 'upstream-failure');
  return failed?.state === 'upstream-failure' ? failed : undefined;
};

const catalogState = (catalog: MesoscaleCatalog, result: Extract<MesoscaleRequestResult<MesoscaleCatalog>, { data: MesoscaleCatalog }>): MesoscaleRequestResult<MesoscaleCatalog> => {
  if (catalog.status === 'failed') return { state: 'upstream-failure', message: 'Catalog cycle is marked failed.', retryable: false };
  const normalized = normalizeMesoscaleCatalog(catalog);
  const failure = normalizedFailure(normalized);
  if (failure) return failure;
  const stale = result.stale || Date.now() - Date.parse(catalog.cycleTime) > 180 * 60_000;
  if (stale) return { ...result, state: 'stale', stale: true };
  const partial = catalog.status === 'partial' || normalized.some(value => value.state === 'partial');
  return partial ? { ...result, state: 'partial' } : result;
};

const validateCatalogResult = (catalog: MesoscaleCatalog, model: MesoscaleModelId, cycleId: string): MesoscaleRequestResult<never> | undefined => {
  const error = getCatalogError(catalog, model, cycleId);
  return error ? malformed(error) : undefined;
};

export const fetchMesoscaleCatalog = (model: MesoscaleModelId, cycle: string, options?: RequestOptions) => {
  const cycleId = resolveCycleId(cycle);
  if (!cycleId) return Promise.resolve(malformed('Requested catalog cycle is invalid.'));
  return readJson<MesoscaleCatalog>(`catalog/${model}/${cycleId}.json`, options).then(result => {
    if (!hasData(result)) return result;
    const validation = validateCatalogResult(result.data, model, cycleId);
    return validation ?? catalogState(result.data, result);
  });
};

export const fetchMesoscaleStatus = (options?: RequestOptions) => readJson<MesoscaleStatus>('status', options).then(result => {
  if (!hasData(result)) return result;
  if (!['healthy', 'degraded'].includes(result.data.status) || !Array.isArray(result.data.models)) {
    return { state: 'malformed' as const, message: 'Status response does not match the catalog contract.' };
  }
  return result.data.status === 'degraded' ? { ...result, state: 'partial' as const } : result;
});

function hasData<T>(result: MesoscaleRequestResult<T>): result is Extract<MesoscaleRequestResult<T>, { data: T }> {
  return 'data' in result;
}

const hasBounds = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length !== 4) return false;
  return value.every(Number.isFinite);
};

const isLatestPointer = (value: MesoscaleLatestPointer, model: MesoscaleModelId): boolean => {
  if (value.schemaVersion !== 1) return false;
  if (value.modelId !== model) return false;
  if (!Number.isFinite(Date.parse(value.cycleTime))) return false;
  if (!Number.isFinite(Date.parse(value.publishedAt))) return false;
  return typeof value.catalogUrl === 'string';
};

const TILE_TEMPLATE = /\{z\}.*\{x\}.*\{y\}/;
const hasValidTileUrl = (tile: Record<string, unknown>): boolean => typeof tile.urlTemplate === 'string'
  && TILE_TEMPLATE.test(tile.urlTemplate);

const hasValidTileZoom = (tile: Record<string, unknown>): boolean => {
  if (!Number.isInteger(tile.minZoom) || !Number.isInteger(tile.maxZoom)) return false;
  return Number(tile.minZoom) <= Number(tile.maxZoom);
};

const hasValidTileFormat = (tile: Record<string, unknown>): boolean => tile.format === 'image/png'
  && tile.projection === 'EPSG:3857';

const isCatalogParameter = (value: unknown): boolean => {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  if (!['complete', 'partial', 'failed'].includes(String(value.status))) return false;
  const tile = value.data;
  if (tile.type !== 'xyz-raster') return false;
  if (!hasValidTileUrl(tile)) return false;
  if (!hasValidTileFormat(tile)) return false;
  if (!hasValidTileZoom(tile)) return false;
  return hasBounds(tile.bounds);
};

const isValidCatalogFrameType = (frameType: unknown, forecastHour: unknown): boolean => {
  if (frameType === 'analysis') return forecastHour === 0;
  return frameType === 'forecast' && Number(forecastHour) > 0;
};

const isCatalogFrame = (value: unknown): boolean => {
  if (!isRecord(value) || !Array.isArray(value.parameters)) return false;
  const forecastHour = value.forecastHour;
  if (!isValidCatalogFrameType(value.frameType, forecastHour)) return false;
  if (!Number.isInteger(forecastHour)) return false;
  if (!Number.isFinite(Date.parse(String(value.validTime)))) return false;
  if (!['complete', 'partial', 'failed'].includes(String(value.status))) return false;
  return value.parameters.every(isCatalogParameter);
};

const validateCatalogIdentity = (catalog: MesoscaleCatalog, model: MesoscaleModelId, cycle: string): string | undefined => {
  if (catalog.schemaVersion !== 1) return 'Catalog schema version is unsupported.';
  if (catalog.model?.id !== model) return 'Catalog model does not match the request.';
  if (!Number.isFinite(Date.parse(catalog.cycleTime))) return 'Catalog cycle time is invalid.';
  if (resolveCycleId(catalog.cycleTime) !== cycle) return 'Catalog cycle does not match the request.';
  return undefined;
};

const isCatalogDomain = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const boundsValid = Array.isArray(value.bounds) && value.bounds.length === 4 && value.bounds.every(Number.isFinite);
  const zoomValid = Number.isInteger(value.minZoom) && Number.isInteger(value.maxZoom)
    && Number(value.minZoom) <= Number(value.maxZoom);
  return typeof value.id === 'string' && typeof value.name === 'string'
    && value.projection === 'EPSG:3857' && boundsValid && zoomValid;
};

const validateCatalogDomain = (catalog: MesoscaleCatalog): string | undefined => isCatalogDomain(catalog.domain)
  ? undefined
  : 'Catalog domain metadata is invalid.';

const validateCatalogFrames = (catalog: MesoscaleCatalog): string | undefined => {
  if (!Array.isArray(catalog.frames) || catalog.frames.length === 0) return 'Catalog has no frames.';
  if (!catalog.frames.every(isCatalogFrame)) return 'Catalog frame or tile metadata is malformed.';
  return undefined;
};

const getCatalogError = (catalog: MesoscaleCatalog, model: MesoscaleModelId, cycle: string): string | undefined =>
  validateCatalogIdentity(catalog, model, cycle)
  ?? validateCatalogDomain(catalog)
  ?? validateCatalogFrames(catalog);

export const normalizeCatalogFrame = (catalog: MesoscaleCatalog, frameIndex: number, now = Date.now()): MesoscaleParameterResponse => {
  const frame = catalog.frames[frameIndex];
  if (!frame) return { state: 'malformed', message: 'Catalog frame is missing.' };
  if (frame.status === 'failed') return { state: 'upstream-failure', message: 'Catalog frame is marked failed.', retryable: false };
  const declaredUnavailable = frame.unavailableParameters ?? catalog.unavailableParameters ?? [];
  const failedParameters = frame.parameters.filter(parameter => parameter.status === 'failed');
  const failedIds = new Set(declaredUnavailable.map(parameter => parameter.id));
  const unavailable = [...declaredUnavailable, ...failedParameters
    .filter(parameter => !failedIds.has(parameter.id))
    .map(parameter => ({ id: parameter.id, reason: 'Catalog parameter is marked failed.' }))];
  let isPartial = frame.status === 'partial';
  if (failedParameters.length > 0) isPartial = true;
  if (frame.parameters.some(parameter => parameter.status === 'partial')) isPartial = true;
  const payload = {
    schemaVersion: 1,
    model: {
      ...catalog.model,
      capabilities: {
        availableParameterIds: catalog.frames.flatMap(item => item.parameters.map(value => value.id)).filter((id, index, ids) => ids.indexOf(id) === index),
        maxForecastHour: Math.max(...catalog.frames.map(item => item.forecastHour)),
      },
    },
    frameType: frame.frameType,
    cycleTime: catalog.cycleTime,
    forecastHour: frame.forecastHour,
    validTime: frame.validTime,
    domain: { id: catalog.domain.id, name: catalog.domain.name, bounds: catalog.domain.bounds },
    source: catalog.source ?? frame.parameters[0]?.source,
    parameters: frame.parameters.filter(parameter => parameter.status !== 'failed').map(parameter => ({ id: parameter.id, displayName: parameter.displayName, units: parameter.units, level: parameter.level, legend: parameter.legend, displayType: parameter.displayType, data: parameter.data })),
    requestedParameterIds: frame.requestedParameterIds ?? catalog.requestedParameterIds ?? frame.parameters.map(parameter => parameter.id),
    unavailableParameters: unavailable,
    stale: Math.max(now - Date.parse(catalog.cycleTime), now - Date.parse(frame.validTime)) > 180 * 60_000,
  };
  const normalized = normalizeProviderPayload(payload, { now, staleAfterMs: 180 * 60 * 1000 });
  if (isPartial && normalized.state === 'ready') {
    return { ...normalized, state: 'partial', completeness: 'partial' };
  }
  return normalized;
};

export const normalizeMesoscaleCatalog = (catalog: MesoscaleCatalog, now = Date.now()): MesoscaleParameterResponse[] =>
  catalog.frames.map((_frame, frameIndex) => normalizeCatalogFrame(catalog, frameIndex, now));

export const resolveCycleId = (cycleTime: string): string => {
  if (/^\d{8}T\d{4}Z$/.test(cycleTime)) return cycleTime;
  if (!Number.isFinite(Date.parse(cycleTime))) return '';
  const utc = new Date(cycleTime).toISOString();
  return utc.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}\.\d{3}Z$/, '$1$2$3T$4$5Z');
};
