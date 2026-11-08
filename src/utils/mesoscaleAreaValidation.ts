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
const isAreaId = (value: unknown): boolean => typeof value === 'string'
  && value.trim().length > 0 && value.length <= 128;
const isAreaTitle = (value: unknown): boolean => typeof value === 'string'
  && value.trim().length > 0 && value.length <= 200;
const isHazardLabel = (value: unknown): boolean => typeof value === 'string'
  && value.trim().length > 0 && value.length <= 120;
const isAreaIdentity = (value: Record<string, unknown>): boolean => {
  return [isAreaId(value.id), isAreaTitle(value.title), isHazardLabel(value.hazard)].every(Boolean);
};
const isAreaTimeWindow = (value: Record<string, unknown>): boolean => {
  if (!isIsoTime(value.validStart) || !isIsoTime(value.validEnd)) return false;
  if (Date.parse(value.validStart) > Date.parse(value.validEnd)) return false;
  return isIsoTime(value.createdAt) && isIsoTime(value.updatedAt);
};

export const isMesoscaleArea = (value: unknown): value is MesoscaleArea => {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value)) return false;
  if (!isAreaIdentity(value)) return false;
  if (!isOptionalConfidence(value.confidence)) return false;
  if (!isAreaTimeWindow(value)) return false;
  return isMesoscalePolygon(value.geometry);
};
