import type { Geometry, Position } from 'geojson';
import {
  CUSTOM_PRODUCT_LIMITS,
  CUSTOM_PRODUCTS_SCHEMA_VERSION,
  type CustomCategoryStyle,
  type CustomCategoryTemplate,
  type CustomLayerId,
  type CustomPolygonFeature,
  type CustomProductAccessState,
  type CustomProductId,
  type EmbeddedCustomProductSnapshot,
  type HostedCustomProduct,
  type HostedCustomProductStatus,
  type OneOffCustomLayer,
} from '../types/customProducts';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HATCH_PATTERNS = new Set(['none', 'diagonal', 'reverse-diagonal', 'crosshatch']);

/** Returns true only for non-array object records. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Rejects persistence fields outside a contract's explicit allowlist. */
const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

/** Validates trimmed non-empty text against a bounded length. */
const isBoundedText = (value: unknown, max = CUSTOM_PRODUCT_LIMITS.labelLength): value is string =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;

/** Validates a canonical UTC ISO timestamp. */
const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));

/** Validates an opacity-like value in the inclusive zero-to-one interval. */
const isUnitInterval = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Validates a whole number that may be zero. */
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Validates a whole number that starts at one. */
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** Validates a complete category style without accepting unknown persistence fields. */
export const isCustomCategoryStyle = (value: unknown): value is CustomCategoryStyle => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'fillColor', 'fillOpacity', 'strokeColor', 'strokeOpacity', 'strokeWidth', 'hatch',
  ])) return false;

  return typeof value.fillColor === 'string'
    && HEX_COLOR.test(value.fillColor)
    && isUnitInterval(value.fillOpacity)
    && typeof value.strokeColor === 'string'
    && HEX_COLOR.test(value.strokeColor)
    && isUnitInterval(value.strokeOpacity)
    && typeof value.strokeWidth === 'number'
    && Number.isFinite(value.strokeWidth)
    && value.strokeWidth >= 0
    && value.strokeWidth <= 8
    && typeof value.hatch === 'string'
    && HATCH_PATTERNS.has(value.hatch);
};

/** Validates one bounded ordered category definition. */
export const isCustomCategoryTemplate = (value: unknown): value is CustomCategoryTemplate => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'label', 'order', 'style'])) return false;
  return isBoundedText(value.id)
    && isBoundedText(value.label)
    && isNonNegativeInteger(value.order)
    && isCustomCategoryStyle(value.style);
};

/** Validates category limits, unique identifiers, and stable ordering. */
export const isCustomCategoryList = (value: unknown): value is CustomCategoryTemplate[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > CUSTOM_PRODUCT_LIMITS.categoriesPerProduct) {
    return false;
  }
  if (!value.every(isCustomCategoryTemplate)) return false;
  const ids = new Set(value.map((category) => category.id));
  const orders = new Set(value.map((category) => category.order));
  return ids.size === value.length && orders.size === value.length;
};

/** Validates one finite GeoJSON coordinate position. */
const isPosition = (value: unknown): value is Position =>
  Array.isArray(value)
  && value.length >= 2
  && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));

/** Validates a closed GeoJSON linear ring with enough positions. */
const isLinearRing = (value: unknown): value is Position[] => {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) return false;
  const first = value[0];
  const last = value[value.length - 1];
  return first.length === last.length && first.every((coordinate, index) => coordinate === last[index]);
};

/** Validates the ring collection used by one GeoJSON polygon. */
const isPolygonCoordinates = (value: unknown): value is Position[][] =>
  Array.isArray(value) && value.length > 0 && value.every(isLinearRing);

/** Accepts only Polygon or MultiPolygon geometry for custom forecast content. */
const isCustomPolygonGeometry = (value: unknown): value is Geometry => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'coordinates'])) return false;
  if (value.type === 'Polygon') return isPolygonCoordinates(value.coordinates);
  return value.type === 'MultiPolygon'
    && Array.isArray(value.coordinates)
    && value.coordinates.length > 0
    && value.coordinates.every(isPolygonCoordinates);
};

/** Validates a custom GeoJSON polygon against its owning layer/category identities. */
export const isCustomPolygonFeature = (
  value: unknown,
  layerId?: string,
  categoryIds?: ReadonlySet<string>,
): value is CustomPolygonFeature => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'id', 'geometry', 'properties'])) return false;
  if (value.type !== 'Feature' || !isCustomPolygonGeometry(value.geometry) || !isRecord(value.properties)) return false;
  if (!hasOnlyKeys(value.properties, ['customLayerId', 'categoryId', 'title'])) return false;
  if (!isBoundedText(value.properties.customLayerId) || !isBoundedText(value.properties.categoryId)) return false;
  if (!isBoundedText(value.properties.title)) return false;
  if (layerId && value.properties.customLayerId !== layerId) return false;
  return !categoryIds || categoryIds.has(value.properties.categoryId);
};

/** Creates a detached snapshot so future product edits cannot alter old maps. */
export const createEmbeddedCustomProductSnapshot = (
  product: HostedCustomProduct,
  capturedAt = new Date().toISOString(),
): EmbeddedCustomProductSnapshot => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  sourceProductId: product.id,
  sourceProductVersion: product.version,
  label: product.label,
  categories: product.categories.map((category) => ({
    ...category,
    style: { ...category.style },
  })),
  capturedAt,
});

/** Validates an immutable-by-contract embedded product snapshot. */
export const isEmbeddedCustomProductSnapshot = (value: unknown): value is EmbeddedCustomProductSnapshot => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'schemaVersion', 'sourceProductId', 'sourceProductVersion', 'label', 'categories', 'capturedAt',
  ])) return false;
  return value.schemaVersion === CUSTOM_PRODUCTS_SCHEMA_VERSION
    && (value.sourceProductId === undefined || isBoundedText(value.sourceProductId))
    && (value.sourceProductVersion === undefined || isPositiveInteger(value.sourceProductVersion))
    && isBoundedText(value.label)
    && isCustomCategoryList(value.categories)
    && isIsoTimestamp(value.capturedAt);
};

/** Validates a complete self-contained one-off layer. */
export const isOneOffCustomLayer = (value: unknown): value is OneOffCustomLayer => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'schemaVersion', 'id', 'label', 'order', 'categories', 'features', 'productSnapshot', 'createdAt', 'updatedAt',
  ])) return false;
  if (value.schemaVersion !== CUSTOM_PRODUCTS_SCHEMA_VERSION
    || !isBoundedText(value.id)
    || !isBoundedText(value.label)
    || !isNonNegativeInteger(value.order)
    || !isCustomCategoryList(value.categories)
    || !Array.isArray(value.features)
    || !isIsoTimestamp(value.createdAt)
    || !isIsoTimestamp(value.updatedAt)
    || (value.productSnapshot !== undefined && !isEmbeddedCustomProductSnapshot(value.productSnapshot))) {
    return false;
  }
  const categoryIds = new Set(value.categories.map((category) => category.id));
  return value.features.every((feature) => isCustomPolygonFeature(feature, value.id as string, categoryIds));
};

/** Validates the owner-scoped reusable product persistence shape. */
export const isHostedCustomProduct = (value: unknown): value is HostedCustomProduct => {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'schemaVersion', 'id', 'userId', 'label', 'description', 'version', 'status', 'categories', 'createdAt', 'updatedAt',
  ])) return false;
  return value.schemaVersion === CUSTOM_PRODUCTS_SCHEMA_VERSION
    && isBoundedText(value.id)
    && isBoundedText(value.userId, 128)
    && isBoundedText(value.label)
    && (value.description === undefined || (typeof value.description === 'string' && value.description.length <= 500))
    && isPositiveInteger(value.version)
    && (value.status === 'active' || value.status === 'archived')
    && isCustomCategoryList(value.categories)
    && isIsoTimestamp(value.createdAt)
    && isIsoTimestamp(value.updatedAt);
};

/** Derives editability without mutating persisted product or embedded snapshot data. */
export const getCustomProductAccessState = ({
  premiumActive,
  status,
}: {
  premiumActive: boolean;
  status: HostedCustomProductStatus;
}): CustomProductAccessState => {
  if (status === 'archived') return { mode: 'read-only', reason: 'archived' };
  if (!premiumActive) return { mode: 'read-only', reason: 'premium-expired' };
  return { mode: 'editable' };
};

/** Produces the next stable product revision while preserving identity and creation time. */
export const reviseHostedCustomProduct = (
  product: HostedCustomProduct,
  changes: Pick<HostedCustomProduct, 'label' | 'description' | 'categories' | 'status'>,
  updatedAt = new Date().toISOString(),
): HostedCustomProduct => ({
  ...product,
  ...changes,
  categories: changes.categories.map((category) => ({ ...category, style: { ...category.style } })),
  version: product.version + 1,
  updatedAt,
});

/** Seeds a self-contained empty layer from a reusable product snapshot. */
export const createLayerFromHostedProduct = ({
  product,
  layerId,
  order,
  createdAt = new Date().toISOString(),
}: {
  product: HostedCustomProduct;
  layerId: CustomLayerId;
  order: number;
  createdAt?: string;
}): OneOffCustomLayer => {
  const productSnapshot = createEmbeddedCustomProductSnapshot(product, createdAt);
  return {
    schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
    id: layerId,
    label: product.label,
    order,
    categories: productSnapshot.categories.map((category) => ({ ...category, style: { ...category.style } })),
    features: [],
    productSnapshot,
    createdAt,
    updatedAt: createdAt,
  };
};

/** Brands a validated opaque string as a custom layer identifier. */
export const asCustomLayerId = (value: string): CustomLayerId => value as CustomLayerId;

/** Brands a validated opaque string as a hosted custom product identifier. */
export const asCustomProductId = (value: string): CustomProductId => value as CustomProductId;
