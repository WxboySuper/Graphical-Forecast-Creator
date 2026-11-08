import type { MesoscaleModelId, MesoscaleParameterResponse } from './contracts';
import type { MesoscaleCatalog, MesoscaleLatestPointer, MesoscaleStatus } from './catalogContracts';
import { getCatalogError, isLatestPointer, resolveCycleId } from './catalogAdapter';
import { normalizeCatalogFrame, normalizeMesoscaleCatalog } from './catalogNormalization';
import { readMesoscaleJson, type MesoscaleRequestResult, type RequestOptions } from './request';
import { isRecord } from './providerPayloadValidation';

export type { MesoscaleRequestResult, RequestOptions } from './request';
export interface LatestRequestOptions { model: MesoscaleModelId; options?: RequestOptions }
export interface CatalogRequestOptions { model: MesoscaleModelId; cycle: string; options?: RequestOptions }

const hasData = <T,>(result: MesoscaleRequestResult<T>): result is Extract<MesoscaleRequestResult<T>, { data: T }> => 'data' in result;
const malformed = (message: string): MesoscaleRequestResult<never> => ({ state: 'malformed', message });

export const fetchMesoscaleLatest = ({ model, options = {} }: LatestRequestOptions) =>
  readMesoscaleJson<MesoscaleLatestPointer>({ path: `latest/${model}.json`, options }).then(result => {
    if (!hasData(result)) return result;
    if (!isLatestPointer(result.data, model)) return malformed('Latest pointer does not match the catalog contract.');
    return result.stale ? { ...result, state: 'stale' as const } : result;
  });

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
  return readMesoscaleJson<MesoscaleCatalog>({ path: `catalog/${model}/${cycleId}.json`, options }).then(result => {
    if (!hasData(result)) return result;
    const validation = validateCatalogResult({ catalog: result.data, model, cycleId });
    return validation ?? catalogState(result.data, result);
  });
};

const isValidLatestTime = (value: Record<string, unknown>): boolean => {
  if (!('latestCycleTime' in value)) return false;
  if (value.latestCycleTime === null) return true;
  if (typeof value.latestCycleTime !== 'string') return false;
  return Number.isFinite(Date.parse(value.latestCycleTime));
};

const isValidStatusAge = (value: Record<string, unknown>): boolean => {
  if (!('ageMinutes' in value)) return false;
  if (value.ageMinutes === null) return true;
  return Number.isFinite(value.ageMinutes);
};

const isValidHealth = (value: Record<string, unknown>): boolean => {
  if (!('health' in value)) return false;
  return ['complete', 'partial', 'failed', 'missing', 'invalid', 'unavailable'].includes(String(value.health));
};

const isValidStatusModel = (value: Record<string, unknown>): boolean => {
  if (!('modelId' in value) || !['hrrr', 'rap', 'rrfs'].includes(String(value.modelId))) return false;
  if (!isValidLatestTime(value)) return false;
  if (!isValidStatusAge(value)) return false;
  if (!('stale' in value) || typeof value.stale !== 'boolean') return false;
  if (!isValidHealth(value) || !('healthGeneratedAt' in value)) return false;
  return value.healthGeneratedAt === null || Number.isFinite(Date.parse(String(value.healthGeneratedAt)));
};

const isStatusModel = (value: unknown): boolean => isRecord(value) && isValidStatusModel(value);

const isValidStatus = (value: MesoscaleStatus): boolean => {
  if (!['healthy', 'degraded'].includes(value.status)) return false;
  if (!Array.isArray(value.models)) return false;
  return value.models.every(isStatusModel);
};

export const fetchMesoscaleStatus = (options: RequestOptions = {}) => readMesoscaleJson<MesoscaleStatus>({ path: 'status', options }).then(result => {
  if (!hasData(result)) return result;
  if (!isValidStatus(result.data)) return malformed('Status response does not match the catalog contract.');
  return result.data.status === 'degraded' ? { ...result, state: 'partial' as const } : result;
});

export { normalizeCatalogFrame, normalizeMesoscaleCatalog };
export { resolveCycleId };
