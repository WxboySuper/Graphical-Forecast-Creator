import type { MesoscaleArea, MesoscaleModelContext, MesoscaleState } from '../store/mesoscaleSlice';
import { isRecord } from './forecastWorkspaceEnvelope';
import { isMesoscalePolygon } from './mesoscaleGeometryValidation';
import { MAX_MESOSCALE_AREAS, MAX_MESOSCALE_DISCUSSION_LENGTH } from './mesoscaleValidationLimits';

export { MAX_MESOSCALE_AREAS, MAX_MESOSCALE_DISCUSSION_LENGTH } from './mesoscaleValidationLimits';
export { MAX_MESOSCALE_POLYGON_VERTICES } from './mesoscaleValidationLimits';
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));
const isIsoTime = (value: unknown): value is string =>
  typeof value === 'string' && ISO_TIME.test(value) && Number.isFinite(Date.parse(value));
const isOptionalConfidence = (value: unknown): boolean => value === undefined
  || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
const isAreaIdentity = (value: Record<string, unknown>): boolean =>
  typeof value.id === 'string' && value.id.trim().length > 0 && value.id.length <= 128
  && typeof value.title === 'string' && value.title.trim().length > 0 && value.title.length <= 200
  && typeof value.hazard === 'string' && value.hazard.trim().length > 0 && value.hazard.length <= 120;
const isAreaTimeWindow = (value: Record<string, unknown>): boolean => {
  if (!isIsoTime(value.validStart) || !isIsoTime(value.validEnd)) return false;
  return Date.parse(value.validStart) <= Date.parse(value.validEnd)
    && isIsoTime(value.createdAt) && isIsoTime(value.updatedAt);
};
const isArea = (value: unknown): value is MesoscaleArea => {
  if (!isRecord(value)) return false;
  const keys = ['id', 'title', 'hazard', 'confidence', 'validStart', 'validEnd', 'geometry', 'createdAt', 'updatedAt'];
  return hasOnlyKeys(value, keys) && isAreaIdentity(value) && isOptionalConfidence(value.confidence)
    && isAreaTimeWindow(value) && isMesoscalePolygon(value.geometry);
};
const isLayer = (value: unknown): boolean => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'opacity'])) return false;
  const validId = typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 120;
  const validOpacity = typeof value.opacity === 'number' && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1;
  return validId && validOpacity;
};
const isModelId = (value: unknown): boolean => value === null
  || (typeof value === 'string' && value.trim().length > 0 && value.length <= 120);
const isForecastHour = (value: unknown): boolean => value === null
  || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999);
const isModelContext = (value: unknown): value is MesoscaleModelContext => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['modelId', 'cycle', 'forecastHour', 'activeLayers'])) return false;
  const validFields = isModelId(value.modelId) && (value.cycle === null || isIsoTime(value.cycle)) && isForecastHour(value.forecastHour);
  if (!validFields || !Array.isArray(value.activeLayers) || value.activeLayers.length > 100) return false;
  const layerIds = value.activeLayers.filter(isLayer).map((layer) => (layer as { id: string }).id);
  return layerIds.length === value.activeLayers.length && new Set(layerIds).size === layerIds.length;
};

export const validateMesoscaleState = (value: unknown): value is MesoscaleState =>
  isRecord(value) && hasOnlyKeys(value, ['areas', 'discussion', 'modelContext'])
  && Array.isArray(value.areas) && value.areas.length <= MAX_MESOSCALE_AREAS
  && value.areas.every(isArea) && new Set(value.areas.map((area) => area.id)).size === value.areas.length
  && typeof value.discussion === 'string' && value.discussion.length <= MAX_MESOSCALE_DISCUSSION_LENGTH
  && isModelContext(value.modelContext);

const getAreaError = (value: Record<string, unknown>): string | null => {
  if (!Array.isArray(value.areas)) return 'Mesoscale areas must be a list.';
  if (value.areas.length > MAX_MESOSCALE_AREAS) return `Mesoscale saves support at most ${MAX_MESOSCALE_AREAS} areas.`;
  if (!value.areas.every(isArea)) return 'A mesoscale area has invalid fields, times, or polygon geometry.';
  const ids = value.areas.map((area) => (area as MesoscaleArea).id);
  return new Set(ids).size === ids.length ? null : 'Mesoscale area IDs must be unique.';
};
const getDiscussionError = (value: Record<string, unknown>): string | null => {
  if (typeof value.discussion !== 'string') return 'Mesoscale discussion must be text.';
  return value.discussion.length <= MAX_MESOSCALE_DISCUSSION_LENGTH
    ? null : `Mesoscale discussion exceeds ${MAX_MESOSCALE_DISCUSSION_LENGTH} characters.`;
};

export const getMesoscaleValidationError = (value: unknown): string | null => {
  if (!isRecord(value)) return 'Mesoscale save must be an object.';
  if (!hasOnlyKeys(value, ['areas', 'discussion', 'modelContext'])) return 'Mesoscale save contains unsupported fields.';
  const errors = [getAreaError(value), getDiscussionError(value)];
  if (!isModelContext(value.modelContext)) errors.push('Mesoscale model context is invalid.');
  return errors.find((error) => error !== null) ?? null;
};
