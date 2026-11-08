import { isRecord } from './forecastWorkspaceEnvelope';
import { MAX_MESOSCALE_POLYGON_VERTICES } from './mesoscaleValidationLimits';
import type { Polygon } from 'geojson';

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));
const isLongitude = (value: unknown): boolean => typeof value === 'number'
  && Number.isFinite(value) && value >= -180 && value <= 180;
const isLatitude = (value: unknown): boolean => typeof value === 'number'
  && Number.isFinite(value) && value >= -90 && value <= 90;

const isPosition = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [longitude, latitude] = value;
  return isLongitude(longitude) && isLatitude(latitude);
};

const isClosedRing = (ring: unknown): boolean => {
  if (!Array.isArray(ring)) return false;
  if (ring.length < 4 || !ring.every(isPosition)) return false;
  return JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1]);
};

export const isMesoscalePolygon = (value: unknown): value is Polygon => {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ['type', 'coordinates'])) return false;
  if (value.type !== 'Polygon') return false;
  if (!Array.isArray(value.coordinates) || value.coordinates.length === 0) return false;
  if (!value.coordinates.every(isClosedRing)) return false;
  const vertices = value.coordinates.reduce((total, ring) => total + (ring as unknown[]).length, 0);
  return vertices <= MAX_MESOSCALE_POLYGON_VERTICES;
};
