import type { Geometry, Position } from 'geojson';
import {
  CUSTOM_PRODUCT_LIMITS,
  type CustomPolygonFeature,
} from '../types/customProducts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isBoundedText = (value: unknown): value is string =>
  typeof value === 'string'
  && value.trim() === value
  && value.length > 0
  && value.length <= CUSTOM_PRODUCT_LIMITS.labelLength;

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value)
  && [2, 3].includes(value.length)
  && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));

const isLinearRing = (value: unknown): value is Position[] => {
  if (!Array.isArray(value)) return false;
  if (value.length < 4) return false;
  if (!value.every(isPosition)) return false;
  const first = value[0];
  const last = value[value.length - 1];
  if (first.length !== last.length) return false;
  return first.every((coordinate, index) => coordinate === last[index]);
};

const isPolygonCoordinates = (value: unknown): value is Position[][] =>
  Array.isArray(value)
  && value.length > 0
  && value.length <= CUSTOM_PRODUCT_LIMITS.ringsPerPolygon
  && value.every(isLinearRing);

const getGeometryPositions = (value: Record<string, unknown>): Position[] => {
  if (!Array.isArray(value.coordinates)) return [];
  const polygons = value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  return (polygons as Position[][][]).flat(2);
};

const hasValidGeometryDimensions = (value: Record<string, unknown>): boolean => {
  const positions = getGeometryPositions(value);
  if (positions.length === 0 || positions.length > CUSTOM_PRODUCT_LIMITS.coordinatesPerFeature) return false;
  return positions.every((position) => position.length === positions[0].length);
};

const hasValidPolygonGeometry = (value: Record<string, unknown>): boolean =>
  value.type === 'Polygon'
  && isPolygonCoordinates(value.coordinates)
  && hasValidGeometryDimensions(value);

const hasValidMultiPolygonGeometry = (value: Record<string, unknown>): boolean =>
  value.type === 'MultiPolygon'
  && Array.isArray(value.coordinates)
  && value.coordinates.length > 0
  && value.coordinates.length <= CUSTOM_PRODUCT_LIMITS.polygonsPerFeature
  && value.coordinates.every(isPolygonCoordinates)
  && hasValidGeometryDimensions(value);

const isCustomPolygonGeometry = (value: unknown): value is Geometry => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'coordinates'])) return false;
  return hasValidPolygonGeometry(value) || hasValidMultiPolygonGeometry(value);
};

const isBoundingBox = (value: unknown, dimension: number): boolean => {
  if (!Array.isArray(value) || value.length !== dimension * 2) return false;
  if (!value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) return false;
  return value.slice(0, dimension).every((minimum, index) => minimum <= value[index + dimension]);
};

const isOptionalFeatureId = (value: unknown): boolean =>
  value === undefined
  || typeof value === 'string'
  || (typeof value === 'number' && Number.isFinite(value));

const hasValidCustomFeatureShape = (value: Record<string, unknown>): boolean => {
  if (!hasOnlyKeys(value, ['type', 'id', 'geometry', 'properties', 'bbox'])) return false;
  if (value.type !== 'Feature' || !isCustomPolygonGeometry(value.geometry) || !isRecord(value.properties)) return false;
  if (!isOptionalFeatureId(value.id)) return false;
  const dimension = getGeometryPositions(value.geometry as Record<string, unknown>)[0]?.length;
  return value.bbox === undefined || isBoundingBox(value.bbox, dimension);
};

const hasValidCustomFeatureProperties = (properties: Record<string, unknown>): boolean =>
  hasOnlyKeys(properties, ['customLayerId', 'categoryId', 'title'])
  && isBoundedText(properties.customLayerId)
  && isBoundedText(properties.categoryId)
  && isBoundedText(properties.title);

const matchesCustomFeatureOwner = (
  properties: Record<string, unknown>,
  layerId?: string,
  categoryIds?: ReadonlySet<string>,
): boolean => {
  if (layerId !== undefined && properties.customLayerId !== layerId) return false;
  if (categoryIds === undefined) return true;
  return typeof properties.categoryId === 'string' && categoryIds.has(properties.categoryId);
};

/** Validates bounded custom GeoJSON polygons and their layer/category identities. */
export const isCustomPolygonFeature = (
  value: unknown,
  layerId?: string,
  categoryIds?: ReadonlySet<string>,
): value is CustomPolygonFeature => {
  if (!isRecord(value) || !hasValidCustomFeatureShape(value)) return false;
  const properties = value.properties as Record<string, unknown>;
  return hasValidCustomFeatureProperties(properties)
    && matchesCustomFeatureOwner(properties, layerId, categoryIds);
};
