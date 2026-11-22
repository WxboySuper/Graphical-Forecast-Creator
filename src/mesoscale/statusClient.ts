import type { MesoscaleStatus } from './catalogContracts';
import { isRecord } from './providerPayloadValidation';
import { readMesoscaleJson, type MesoscaleRequestResult, type RequestOptions } from './request';

const hasData = (result: MesoscaleRequestResult<MesoscaleStatus>): result is Extract<MesoscaleRequestResult<MesoscaleStatus>, { data: MesoscaleStatus }> => 'data' in result;
const malformed = (): MesoscaleRequestResult<never> => ({ state: 'malformed', message: 'Status response does not match the catalog contract.' });

const isValidModelId = (value: Record<string, unknown>): boolean =>
  ['hrrr', 'rap', 'rrfs'].includes(String(value.modelId));

const isValidLatestTime = (value: Record<string, unknown>): boolean => {
  if (!('latestCycleTime' in value)) return false;
  if (value.latestCycleTime === null) return true;
  if (typeof value.latestCycleTime !== 'string') return false;
  return Number.isFinite(Date.parse(value.latestCycleTime));
};

const isValidAge = (value: Record<string, unknown>): boolean => {
  if (!('ageMinutes' in value)) return false;
  if (value.ageMinutes === null) return true;
  return Number.isFinite(value.ageMinutes);
};

const isValidStaleFlag = (value: Record<string, unknown>): boolean => 'stale' in value && typeof value.stale === 'boolean';

const isValidHealth = (value: Record<string, unknown>): boolean => {
  if (!('health' in value)) return false;
  return ['complete', 'partial', 'failed', 'missing', 'invalid', 'unavailable'].includes(String(value.health));
};

const isValidHealthGeneratedTime = (value: Record<string, unknown>): boolean => {
  if (!('healthGeneratedAt' in value)) return false;
  if (value.healthGeneratedAt === null) return true;
  return Number.isFinite(Date.parse(String(value.healthGeneratedAt)));
};

const modelChecks = [isValidModelId, isValidLatestTime, isValidAge, isValidStaleFlag, isValidHealth, isValidHealthGeneratedTime];
const isValidModel = (value: unknown): boolean => isRecord(value) && modelChecks.every(check => check(value));

const isValidStatus = (value: MesoscaleStatus): boolean => {
  if (!['healthy', 'degraded'].includes(value.status)) return false;
  if (!Array.isArray(value.models)) return false;
  return value.models.every(isValidModel);
};

export const fetchMesoscaleStatus = (options: RequestOptions = {}) =>
  readMesoscaleJson<MesoscaleStatus>({ path: 'status', options }).then(result => {
    if (!hasData(result)) return result;
    if (!isValidStatus(result.data)) return malformed();
    return result.data.status === 'degraded' ? { ...result, state: 'partial' as const } : result;
  });
