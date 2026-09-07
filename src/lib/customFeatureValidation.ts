import { CUSTOM_PRODUCT_LIMITS, type CustomPolygonFeature } from '../types/customProducts';
import { hasValidCustomFeatureShape } from './customFeatureShape';
import { hasOnlyKeys, isBoundedText, isRecord } from './customValidationPrimitives';

/** Validates the bounded property set attached to a custom polygon. */
const hasValidProperties = (properties: Record<string, unknown>): boolean => {
  if (!hasOnlyKeys(properties, ['customLayerId', 'categoryId', 'title'])) return false;
  return isBoundedText(properties.customLayerId, CUSTOM_PRODUCT_LIMITS.labelLength)
    && isBoundedText(properties.categoryId, CUSTOM_PRODUCT_LIMITS.labelLength)
    && isBoundedText(properties.title, CUSTOM_PRODUCT_LIMITS.labelLength);
};

/** Checks whether a polygon belongs to the requested layer and categories. */
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
  if (!isRecord(value) || !hasValidCustomFeatureShape(value)) return false;
  const properties = value.properties as Record<string, unknown>;
  return hasValidProperties(properties) && matchesOwner(properties, layerId, categoryIds);
};
