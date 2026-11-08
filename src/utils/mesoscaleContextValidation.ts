import type { MesoscaleModelContext } from '../store/mesoscaleSlice';
import { isRecord } from './forecastWorkspaceEnvelope';
const CONTEXT_KEYS = ['modelId', 'cycle', 'forecastHour', 'activeLayers'];
const hasOnlyContextKeys = (value: Record<string, unknown>): boolean =>
  Object.keys(value).every((key) => CONTEXT_KEYS.includes(key));
const isModelId = (value: unknown): boolean => value === null
  || (typeof value === 'string' && value.trim().length > 0 && value.length <= 120);
const isCycle = (value: unknown): boolean => value === null || (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
);
const isForecastHour = (value: unknown): boolean => value === null
  || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999);
const isLayerId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 120;
const isOpacity = (value: unknown): boolean => typeof value === 'number'
  && Number.isFinite(value) && value >= 0 && value <= 1;
const isLayer = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !['id', 'opacity'].includes(key))) return false;
  return isLayerId(value.id) && isOpacity(value.opacity);
};
const isLayers = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length > 100 || !value.every(isLayer)) return false;
  const ids = value.map((layer) => (layer as { id: string }).id);
  return new Set(ids).size === ids.length;
};

export const isMesoscaleModelContext = (value: unknown): value is MesoscaleModelContext => {
  if (!isRecord(value) || !hasOnlyContextKeys(value)) return false;
  return isModelId(value.modelId) && isCycle(value.cycle)
    && isForecastHour(value.forecastHour) && isLayers(value.activeLayers);
};
