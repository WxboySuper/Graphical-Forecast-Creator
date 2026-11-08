import { isRecord } from './forecastWorkspaceEnvelope';
import { MAX_MESOSCALE_POLYGON_VERTICES } from './mesoscaleValidationLimits';

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isPosition = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [longitude, latitude] = value;
  return typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
};

const isClosedRing = (ring: unknown): boolean => {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isPosition)) return false;
  return JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1]);
};

export const isMesoscalePolygon = (value: unknown): value is GeoJSON.Polygon => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'coordinates'])) return false;
  if (value.type !== 'Polygon' || !Array.isArray(value.coordinates) || value.coordinates.length === 0) return false;
  if (!value.coordinates.every(isClosedRing)) return false;
  const vertices = value.coordinates.reduce((total, ring) => total + (ring as unknown[]).length, 0);
  return vertices <= MAX_MESOSCALE_POLYGON_VERTICES;
};
