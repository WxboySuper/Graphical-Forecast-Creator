import { getMesoscaleClientConfig, type MesoscaleClientConfig } from '../config/mesoscale';
import type { MesoscaleModelId, MesoscaleParameterResponse } from './contracts';
import type { MesoscaleCatalog, MesoscaleLatestPointer, MesoscaleStatus } from './catalogContracts';
import { readMesoscaleFixture } from './fixtures/client';
import { isRecord } from './providerPayloadValidation';
import { getCatalogError, isLatestPointer, resolveCycleId } from './catalogAdapter';
import { normalizeCatalogFrame, normalizeMesoscaleCatalog } from './catalogNormalization';

export interface RequestOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  config?: MesoscaleClientConfig;
}

interface JsonRequestOptions { path: string; options: RequestOptions }
interface UrlRequestOptions { url: string; options: RequestOptions }
interface RetryAttemptOptions extends UrlRequestOptions { attempt: number; attempts: number }
interface EndpointOptions { config: MesoscaleClientConfig; path: string }

export type MesoscaleRequestResult<T> =
  | { state: 'loading' }
  | { state: 'ready' | 'partial' | 'stale'; data: T; stale: boolean; ageMinutes: number | null }
  | { state: 'upstream-failure'; message: string; retryable: boolean }
  | { state: 'malformed'; message: string };

export interface LatestRequestOptions { model: MesoscaleModelId; options?: RequestOptions }
export interface CatalogRequestOptions { model: MesoscaleModelId; cycle: string; options?: RequestOptions }

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;
const isAbort = (error: unknown): boolean => {
  if (!error || typeof error !== 'object' || !('name' in error)) return false;
  return error.name === 'AbortError' || error.name === 'TimeoutError';
};

const combineSignal = ({ parent, timeoutMs }: { parent?: AbortSignal; timeoutMs: number }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) controller.abort();
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent?.removeEventListener('abort', abort); } };
};

async function fetchAttempt({ url, options }: UrlRequestOptions): Promise<{ response: Response; cleanup: () => void }> {
  const request = combineSignal({ parent: options.signal, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  try {
    const response = await (options.fetcher ?? fetch)(url, { signal: request.signal, headers: { Accept: 'application/json' } });
    return { response, cleanup: request.cleanup };
  } catch (error) {
    request.cleanup();
    throw error;
  }
}

const retryCount = (options: RequestOptions): number => Math.max(0, Math.min(options.retries ?? DEFAULT_RETRIES, 3));

const pauseBeforeRetry = ({ attempt, signal }: { attempt: number; signal?: AbortSignal }): Promise<void> => new Promise((resolve, reject) => {
  const cleanup = () => signal?.removeEventListener('abort', abort);
  const timer = setTimeout(() => { cleanup(); resolve(); }, 150 * (2 ** attempt));
  const abort = () => {
    clearTimeout(timer);
    cleanup();
    reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
  };
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
});

const shouldKeepResponse = ({ response, attempt, attempts }: { response: Response; attempt: number; attempts: number }): boolean => {
  if (response.ok) return true;
  if (response.status < 500) return true;
  return attempt === attempts;
};

const shouldThrowAttemptError = ({ error, attempt, attempts, signal }: { error: unknown; attempt: number; attempts: number; signal?: AbortSignal }): boolean => {
  if (isAbort(error) && signal?.aborted) return true;
  return attempt === attempts;
};

async function attemptWithRetry({ url, options, attempt, attempts }: RetryAttemptOptions) {
  try {
    const request = await fetchAttempt({ url, options });
    if (shouldKeepResponse({ response: request.response, attempt, attempts })) return request;
    request.cleanup();
  } catch (error) {
    if (shouldThrowAttemptError({ error, attempt, attempts, signal: options.signal })) throw error;
  }
  return undefined;
}

async function fetchResponse({ url, options }: UrlRequestOptions): Promise<{ response: Response; cleanup: () => void }> {
  const attempts = retryCount(options);
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const request = await attemptWithRetry({ url, options, attempt, attempts });
    if (request) return request;
    await pauseBeforeRetry({ attempt, signal: options.signal });
  }
  throw new Error('Mesoscale request failed.');
}

const endpoint = ({ config, path }: EndpointOptions): string => `${config.baseUrl.replace(/\/$/, '')}/${path}`;

const readHttpJson = async <T,>({ url, options }: UrlRequestOptions): Promise<MesoscaleRequestResult<T>> => {
  const request = await fetchResponse({ url, options });
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

async function readJson<T>({ path, options }: JsonRequestOptions): Promise<MesoscaleRequestResult<T>> {
  const failure = getReadConfigFailure(options);
  if (failure) return failure;
  const config = options.config ?? getMesoscaleClientConfig();
  if (config.fixtures) return readMesoscaleFixture<T>(path);
  try {
    return await readHttpJson<T>({ url: endpoint({ config, path }), options });
  } catch (error) {
    if (options.signal?.aborted) return { state: 'upstream-failure', message: 'Mesoscale request was cancelled.', retryable: false };
    if (isAbort(error)) return { state: 'upstream-failure', message: 'Mesoscale request timed out.', retryable: true };
    if (error instanceof SyntaxError) return { state: 'malformed', message: 'Mesoscale response is not valid JSON.' };
    return { state: 'upstream-failure', message: 'Mesoscale service is unavailable.', retryable: true };
  }
}

export const fetchMesoscaleLatest = ({ model, options = {} }: LatestRequestOptions) =>
  readJson<MesoscaleLatestPointer>({ path: `latest/${model}.json`, options }).then(result => {
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

const validateCatalogResult = ({ catalog, model, cycleId }: { catalog: MesoscaleCatalog; model: MesoscaleModelId; cycleId: string }): MesoscaleRequestResult<never> | undefined => {
  const error = getCatalogError(catalog, model, cycleId);
  return error ? malformed(error) : undefined;
};

export const fetchMesoscaleCatalog = ({ model, cycle, options = {} }: CatalogRequestOptions) => {
  const cycleId = resolveCycleId(cycle);
  if (!cycleId) return Promise.resolve(malformed('Requested catalog cycle is invalid.'));
  return readJson<MesoscaleCatalog>({ path: `catalog/${model}/${cycleId}.json`, options }).then(result => {
    if (!hasData(result)) return result;
    const validation = validateCatalogResult({ catalog: result.data, model, cycleId });
    return validation ?? catalogState(result.data, result);
  });
};

const isStatusModel = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (!['hrrr', 'rap', 'rrfs'].includes(String(value.modelId))) return false;
  if (typeof value.latestCycleTime === 'string' && !Number.isFinite(Date.parse(value.latestCycleTime))) return false;
  if (value.latestCycleTime !== null && typeof value.latestCycleTime !== 'string') return false;
  if (value.ageMinutes !== null && !Number.isFinite(value.ageMinutes)) return false;
  if (typeof value.stale !== 'boolean') return false;
  if (!['complete', 'partial', 'failed', 'missing', 'invalid', 'unavailable'].includes(String(value.health))) return false;
  return value.healthGeneratedAt === null || Number.isFinite(Date.parse(String(value.healthGeneratedAt)));
};

const isValidStatus = (value: MesoscaleStatus): boolean => {
  if (!['healthy', 'degraded'].includes(value.status)) return false;
  if (!Array.isArray(value.models)) return false;
  return value.models.every(isStatusModel);
};

export const fetchMesoscaleStatus = (options: RequestOptions = {}) => readJson<MesoscaleStatus>({ path: 'status', options }).then(result => {
  if (!hasData(result)) return result;
  if (!isValidStatus(result.data)) {
    return { state: 'malformed' as const, message: 'Status response does not match the catalog contract.' };
  }
  return result.data.status === 'degraded' ? { ...result, state: 'partial' as const } : result;
});

function hasData<T>(result: MesoscaleRequestResult<T>): result is Extract<MesoscaleRequestResult<T>, { data: T }> {
  return 'data' in result;
}

export { normalizeCatalogFrame, normalizeMesoscaleCatalog };
export { resolveCycleId };
