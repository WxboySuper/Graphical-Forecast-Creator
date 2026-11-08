import type { MesoscaleArea, MesoscaleModelContext, MesoscaleState } from '../store/mesoscaleSlice';
import { isRecord } from './forecastWorkspaceEnvelope';

export const MAX_MESOSCALE_AREAS = 20;
export const MAX_MESOSCALE_POLYGON_VERTICES = 5000;
export const MAX_MESOSCALE_DISCUSSION_LENGTH = 50000;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isIsoTime = (value: unknown): value is string =>
  typeof value === 'string' && ISO_TIME.test(value) && Number.isFinite(Date.parse(value));
const isPosition = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === 'number' && Number.isFinite(part))
    && value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
const isPolygon = (value: unknown): value is GeoJSON.Polygon => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'coordinates']) || value.type !== 'Polygon' || !Array.isArray(value.coordinates) || value.coordinates.length === 0) return false;
  let vertices = 0;
  for (const ring of value.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    vertices += ring.length;
    if (vertices > MAX_MESOSCALE_POLYGON_VERTICES || !ring.every(isPosition)) return false;
    if (JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1])) return false;
  }
  return true;
};
const isArea = (value: unknown): value is MesoscaleArea => {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ['id', 'title', 'hazard', 'confidence', 'validStart', 'validEnd', 'geometry', 'createdAt', 'updatedAt'])) return false;
  const confidenceValid = value.confidence === undefined || (typeof value.confidence === 'number' && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 100);
  return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128
    && typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 200
    && typeof value.hazard === 'string' && value.hazard.trim().length > 0 && value.hazard.length <= 120
    && confidenceValid && isIsoTime(value.validStart) && isIsoTime(value.validEnd)
    && Date.parse(value.validStart as string) <= Date.parse(value.validEnd as string)
    && isPolygon(value.geometry) && isIsoTime(value.createdAt) && isIsoTime(value.updatedAt);
};
const isModelId = (value: unknown): boolean => value === null || (typeof value === 'string' && value.length <= 120);
const isForecastHour = (value: unknown): boolean => value === null
  || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999);
const isActiveLayer = (value: unknown): boolean => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'opacity'])) return false;
  const validId = typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 120;
  const validOpacity = typeof value.opacity === 'number' && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1;
  return validId && validOpacity;
};
const isModelContext = (value: unknown): value is MesoscaleModelContext => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['modelId', 'cycle', 'forecastHour', 'activeLayers'])) return false;
  if (!isModelId(value.modelId) || !(value.cycle === null || isIsoTime(value.cycle))) return false;
  if (!isForecastHour(value.forecastHour) || !Array.isArray(value.activeLayers)) return false;
  return value.activeLayers.length <= 100 && value.activeLayers.every(isActiveLayer);
};

export const validateMesoscaleState = (value: unknown): value is MesoscaleState =>
  isRecord(value) && hasOnlyKeys(value, ['areas', 'discussion', 'modelContext']) && Array.isArray(value.areas) && value.areas.length <= MAX_MESOSCALE_AREAS
  && value.areas.every(isArea) && typeof value.discussion === 'string'
  && value.discussion.length <= MAX_MESOSCALE_DISCUSSION_LENGTH && isModelContext(value.modelContext);

export const getMesoscaleValidationError = (value: unknown): string | null => {
  if (!isRecord(value)) return 'Mesoscale save must be an object.';
  if (!hasOnlyKeys(value, ['areas', 'discussion', 'modelContext'])) return 'Mesoscale save contains unsupported fields.';
  if (!Array.isArray(value.areas)) return 'Mesoscale areas must be a list.';
  if (value.areas.length > MAX_MESOSCALE_AREAS) return `Mesoscale saves support at most ${MAX_MESOSCALE_AREAS} areas.`;
  if (!value.areas.every(isArea)) return 'A mesoscale area has invalid fields, times, or polygon geometry.';
  if (new Set(value.areas.map((area) => (area as { id: unknown }).id)).size !== value.areas.length) return 'Mesoscale area IDs must be unique.';
  if (typeof value.discussion !== 'string') return 'Mesoscale discussion must be text.';
  if (value.discussion.length > MAX_MESOSCALE_DISCUSSION_LENGTH) return `Mesoscale discussion exceeds ${MAX_MESOSCALE_DISCUSSION_LENGTH} characters.`;
  if (!isModelContext(value.modelContext)) return 'Mesoscale model context is invalid.';
  return null;
};
