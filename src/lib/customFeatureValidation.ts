import type { CustomPolygonFeature } from '../types/customProducts';
import { CUSTOM_PRODUCT_LIMITS } from '../types/customProducts';
import { getCustomGeometryDimension, isCustomPolygonGeometry } from './customGeometry';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isBoundedText = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim() !== value) return false;
  return value.length > 0 && value.length <= CUSTOM_PRODUCT_LIMITS.labelLength;
};

const isBoundingBox = (value: unknown, dimension: number): boolean => {
  if (!Array.isArray(value) || value.length !== dimension * 2) return false;
  if (!value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) return false;
  return value.slice(0, dimension).every((minimum, index) => minimum <= value[index + dimension]);
};

const isOptionalFeatureId = (value: unknown): boolean => {
  if (value === undefined || typeof value === 'string') return true;
  return typeof value === 'number' && Number.isFinite(value);
};

const isFeatureType = (value: Record<string, unknown>): boolean => value.type === 'Feature';

const hasFeatureProperties = (value: Record<string, unknown>): boolean => isRecord(value.properties);

const hasValidShape = (value: Record<string, unknown>): boolean => {
  if (!hasOnlyKeys(value, ['type', 'id', 'geometry', 'properties', 'bbox'])) return false;
  if (!isFeatureType(value) || !isCustomPolygonGeometry(value.geometry)) return false;
  if (!hasFeatureProperties(value) || !isOptionalFeatureId(value.id)) return false;
  if (value.bbox === undefined) return true;
  return isBoundingBox(value.bbox, getCustomGeometryDimension(value.geometry));
};

const hasValidProperties = (properties: Record<string, unknown>): boolean => {
  if (!hasOnlyKeys(properties, ['customLayerId', 'categoryId', 'title'])) return false;
  return isBoundedText(properties.customLayerId)
    && isBoundedText(properties.categoryId)
    && isBoundedText(properties.title);
};

const matchesOwner = (
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
  if (!isRecord(value) || !hasValidShape(value)) return false;
  const properties = value.properties as Record<string, unknown>;
  return hasValidProperties(properties) && matchesOwner(properties, layerId, categoryIds);
};
