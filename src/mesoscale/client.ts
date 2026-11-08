import { getMesoscaleClientConfig, type MesoscaleClientConfig } from '../config/mesoscale';
import { normalizeProviderPayload } from './normalizeProviderPayload';
import type { MesoscaleModelId, MesoscaleParameterResponse } from './contracts';
import type { MesoscaleCatalog, MesoscaleLatestPointer, MesoscaleStatus } from './catalogContracts';
import { FIXTURE_STATUS, getFixtureCatalog, getFixtureLatest } from './fixtures/catalogs';
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

async function fetchResponse(url: string, options: RequestOptions): Promise<{ response: Response; cleanup: () => void }> {
  const attempts = Math.max(0, Math.min(options.retries ?? DEFAULT_RETRIES, 3));
  let failure: unknown;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      const request = await fetchAttempt(url, options);
      if (request.response.ok || request.response.status < 500 || attempt === attempts) return request;
      request.cleanup();
    } catch (error) {
      failure = error;
      if (isAbort(error) || attempt === attempts) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 150 * (2 ** attempt)));
  }
  throw failure ?? new Error('Mesoscale request failed.');
}

const endpoint = (config: MesoscaleClientConfig, path: string): string => `${config.baseUrl.replace(/\/$/, '')}/${path}`;

async function readJson<T>(path: string, options: RequestOptions = {}): Promise<MesoscaleRequestResult<T>> {
  if (options.signal?.aborted) return { state: 'upstream-failure', message: 'Request was cancelled.', retryable: false };
  const config = options.config ?? getMesoscaleClientConfig();
  if (!config.enabled) return { state: 'upstream-failure', message: 'Mesoscale is disabled for this build target.', retryable: false };
  if (config.fixtures) return readFixture<T>(path);
  try {
    const request = await fetchResponse(endpoint(config, path), options);
    const { response } = request;
    try {
      if (!response.ok) return { state: 'upstream-failure', message: `Mesoscale request failed (${response.status}).`, retryable: response.status >= 500 };
      const data = await response.json() as T;
      if (!isRecord(data)) return { state: 'malformed', message: 'Mesoscale response must be a JSON object.' };
      const age = Number(response.headers.get('X-Mesoscale-Age-Minutes'));
      return {
        state: 'ready', data,
        stale: response.headers.get('X-Mesoscale-Stale') === 'true',
        ageMinutes: Number.isFinite(age) ? age : null,
      };
    } finally {
      request.cleanup();
    }
  } catch (error) {
    if (isAbort(error)) return { state: 'upstream-failure', message: 'Mesoscale request timed out or was cancelled.', retryable: false };
    if (error instanceof SyntaxError) return { state: 'malformed', message: 'Mesoscale response is not valid JSON.' };
    return { state: 'upstream-failure', message: 'Mesoscale service is unavailable.', retryable: true };
  }
}

function readFixture<T>(path: string): MesoscaleRequestResult<T> {
  if (path === 'status') return { state: 'partial', data: FIXTURE_STATUS as T, stale: true, ageMinutes: null };
  const latest = path.match(/^latest\/(hrrr|rap|rrfs)\.json$/);
  if (latest) {
    const data = getFixtureLatest(latest[1] as MesoscaleModelId);
    return data ? { state: 'stale', data: data as T, stale: true, ageMinutes: null } : { state: 'upstream-failure', message: 'No fixture exists for this model.', retryable: false };
  }
  const catalog = path.match(/^catalog\/(hrrr|rap|rrfs)\/([\wTZ]+)\.json$/);
  if (catalog) {
    const data = getFixtureCatalog(catalog[1] as MesoscaleModelId, catalog[2]);
    const ageMinutes = Math.floor((Date.now() - Date.parse(data?.cycleTime ?? '')) / 60000);
    if (!data) return { state: 'upstream-failure', message: 'Fixture catalog was not found.', retryable: false };
    const stale = Date.now() - Date.parse(data.cycleTime) > 180 * 60000;
    return { state: stale ? 'stale' : data.status === 'partial' ? 'partial' : 'ready', data: data as T, stale, ageMinutes };
  }
  return { state: 'malformed', message: 'Unknown mesoscale fixture route.' };
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

export const fetchMesoscaleCatalog = (model: MesoscaleModelId, cycle: string, options?: RequestOptions) => {
  const cycleId = resolveCycleId(cycle);
  if (!cycleId) return Promise.resolve({ state: 'malformed' as const, message: 'Requested catalog cycle is invalid.' });
  return readJson<MesoscaleCatalog>(`catalog/${model}/${cycleId}.json`, options).then(result => {
    if (!hasData(result)) return result;
    const catalog = result.data;
    const validationError = getCatalogError(catalog, model, cycleId);
    if (validationError) return { state: 'malformed' as const, message: validationError };
    const normalized = normalizeMesoscaleCatalog(catalog);
    const malformed = normalized.find(value => value.state === 'malformed');
    if (malformed?.state === 'malformed') return { state: 'malformed' as const, message: malformed.message };
    if (catalog.status === 'failed') return { state: 'upstream-failure' as const, message: 'Catalog cycle is marked failed.', retryable: false };
    const failedFrame = normalized.find(value => value.state === 'upstream-failure');
    if (failedFrame?.state === 'upstream-failure') return failedFrame;
    if (result.stale || Date.now() - Date.parse(catalog.cycleTime) > 180 * 60_000) return { ...result, state: 'stale' as const, stale: true };
    if (catalog.status === 'partial' || normalized.some(value => value.state === 'partial')) return { ...result, state: 'partial' as const };
    return result;
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

const hasValidTileUrl = (tile: Record<string, unknown>): boolean => typeof tile.urlTemplate === 'string';

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

const getCatalogError = (catalog: MesoscaleCatalog, model: MesoscaleModelId, cycle: string): string | undefined => {
  if (catalog.schemaVersion !== 1) return 'Catalog schema version is unsupported.';
  if (catalog.model?.id !== model) return 'Catalog model does not match the request.';
  if (!Number.isFinite(Date.parse(catalog.cycleTime))) return 'Catalog cycle time is invalid.';
  if (resolveCycleId(catalog.cycleTime) !== cycle) return 'Catalog cycle does not match the request.';
  if (!Array.isArray(catalog.frames) || catalog.frames.length === 0) return 'Catalog has no frames.';
  if (!catalog.frames.every(isCatalogFrame)) return 'Catalog frame or tile metadata is malformed.';
  return undefined;
};

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
