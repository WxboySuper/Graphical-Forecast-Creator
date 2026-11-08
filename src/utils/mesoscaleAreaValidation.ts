import type { MesoscaleArea } from '../store/mesoscaleSlice';
import { isRecord } from './forecastWorkspaceEnvelope';
import { isMesoscalePolygon } from './mesoscaleGeometryValidation';

const AREA_KEYS = ['id', 'title', 'hazard', 'confidence', 'validStart', 'validEnd', 'geometry', 'createdAt', 'updatedAt'];
const hasOnlyKeys = (value: Record<string, unknown>): boolean => Object.keys(value).every((key) => AREA_KEYS.includes(key));
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const isIsoTime = (value: unknown): value is string =>
  typeof value === 'string' && ISO_TIME.test(value) && Number.isFinite(Date.parse(value));
const isOptionalConfidence = (value: unknown): boolean => value === undefined
  || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
const isAreaIdentity = (value: Record<string, unknown>): boolean => {
  const id = typeof value.id === 'string' && value.id.trim().length > 0 && value.id.length <= 128;
  const title = typeof value.title === 'string' && value.title.trim().length > 0 && value.title.length <= 200;
  const hazard = typeof value.hazard === 'string' && value.hazard.trim().length > 0 && value.hazard.length <= 120;
  return id && title && hazard;
};
const isAreaTimeWindow = (value: Record<string, unknown>): boolean => {
  if (!isIsoTime(value.validStart) || !isIsoTime(value.validEnd)) return false;
  if (Date.parse(value.validStart) > Date.parse(value.validEnd)) return false;
  return isIsoTime(value.createdAt) && isIsoTime(value.updatedAt);
};

export const isMesoscaleArea = (value: unknown): value is MesoscaleArea => {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value)) return false;
  const fieldsValid = isAreaIdentity(value) && isOptionalConfidence(value.confidence) && isAreaTimeWindow(value);
  return fieldsValid && isMesoscalePolygon(value.geometry);
};
