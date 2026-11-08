import { getMesoscaleClientConfig, type MesoscaleClientConfig } from '../config/mesoscale';
import type { MesoscaleModelId, MesoscaleParameterResponse } from './contracts';
import type { MesoscaleCatalog, MesoscaleLatestPointer, MesoscaleStatus } from './catalogContracts';
import { readMesoscaleFixture } from './fixtures/client';
import { isRecord } from './providerPayloadValidation';
import { getCatalogError, isLatestPointer, normalizeCatalogFrame, normalizeMesoscaleCatalog, resolveCycleId } from './catalogAdapter';

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

const shouldKeepResponse = (response: Response, attempt: number, attempts: number): boolean => {
  if (response.ok) return true;
  if (response.status < 500) return true;
  return attempt === attempts;
};

const shouldThrowAttemptError = (error: unknown, attempt: number, attempts: number): boolean => {
  if (isAbort(error)) return true;
  return attempt === attempts;
};

async function attemptWithRetry(url: string, options: RequestOptions, attempt: number, attempts: number) {
  try {
    const request = await fetchAttempt(url, options);
    if (shouldKeepResponse(request.response, attempt, attempts)) return request;
    request.cleanup();
  } catch (error) {
    if (shouldThrowAttemptError(error, attempt, attempts)) throw error;
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

export { normalizeCatalogFrame, normalizeMesoscaleCatalog, resolveCycleId };
