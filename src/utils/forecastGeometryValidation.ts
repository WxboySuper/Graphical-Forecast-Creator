import type { Feature, Geometry } from 'geojson';
import { MAX_ARRAY_ITEMS, fail, type ImportValidationResult } from './forecastValidationTypes';

/** Maximum coordinate positions per geometry. */
export const MAX_COORDINATE_POSITIONS = 500_000;

const SUPPORTED_GEOMETRY_TYPES = new Set<string>([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
]);

/** Returns true when a numeric coordinate position is non-finite (NaN or Infinity). */
const isNonFinitePosition = (item: unknown): boolean =>
  typeof item === 'number' && !Number.isFinite(item);

/** Returns true when any item in a coordinate leaf is non-finite. */
const leafHasNonFinite = (leaf: unknown[]): boolean => leaf.some(isNonFinitePosition);

/** Returns true for a non-null, non-array object. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Coordinate budget shared by one geometry and every child of its collection.
 * A GeometryCollection must not hand each child its own full allowance, or a
 * crafted import can hide any number of positions behind one collection.
 */
interface CoordinateBudget {
  remaining: number;
  hasNonFinite: boolean;
}

/** Recursively walks a nested coordinate tree, charging positions against a shared budget. */
const walkCoordinates = (value: unknown, budget: CoordinateBudget): void => {
  if (budget.remaining <= 0) return;
  if (!Array.isArray(value)) return;

  if (value.length > 0 && Array.isArray(value[0])) {
    value.forEach((child) => walkCoordinates(child, budget));
    return;
  }

  if (!budget.hasNonFinite && leafHasNonFinite(value)) {
    budget.hasNonFinite = true;
  }
  budget.remaining -= value.length;
};

/**
 * Charges a geometry's coordinate positions against the shared budget.
 * GeometryCollection children draw from the same budget as their parent.
 */
const chargeCoordinates = (geometry: Geometry, budget: CoordinateBudget): void => {
  if (geometry.type === 'GeometryCollection') {
    const children = (geometry as unknown as { geometries?: unknown }).geometries;
    if (!Array.isArray(children)) return;
    for (const child of children) {
      if (budget.remaining <= 0) return;
      if (!isPlainObject(child)) return;
      chargeCoordinates(child as unknown as Geometry, budget);
    }
    return;
  }
  walkCoordinates((geometry as { coordinates?: unknown }).coordinates, budget);
};

/** Validates the child geometries of a GeometryCollection. */
function validateGeometryCollection(geometries: unknown): ImportValidationResult | null {
  if (!Array.isArray(geometries) || geometries.length > MAX_ARRAY_ITEMS) {
    return fail('Forecast geometry collection is invalid or too large.');
  }
  for (const child of geometries) {
    const childResult = inspectGeometry(child);
    if (childResult) return childResult;
  }
  return null;
}

/** Validates one geometry's shape, descending into collection children. */
function inspectGeometry(value: unknown): ImportValidationResult | null {
  if (!isPlainObject(value)) {
    return fail('Forecast geometry is not a valid object.');
  }

  const geometry = value as { type?: unknown; coordinates?: unknown; geometries?: unknown };
  if (typeof geometry.type !== 'string' || !SUPPORTED_GEOMETRY_TYPES.has(geometry.type)) {
    return fail(`Forecast geometry uses unsupported type "${String(geometry.type)}".`);
  }

  if (geometry.type === 'GeometryCollection') {
    return validateGeometryCollection(geometry.geometries);
  }

  if (!Array.isArray(geometry.coordinates)) {
    return fail(`Forecast geometry "${geometry.type}" is missing coordinates.`);
  }

  return null;
}

/** Validates one GeoJSON geometry object against supported types and coordinate bounds. */
export function validateGeometry(value: unknown): ImportValidationResult | null {
  const shapeResult = inspectGeometry(value);
  if (shapeResult) return shapeResult;

  const budget: CoordinateBudget = { remaining: MAX_COORDINATE_POSITIONS, hasNonFinite: false };
  chargeCoordinates(value as Geometry, budget);

  if (budget.remaining <= 0) {
    return fail('Forecast geometry contains too many coordinates.');
  }
  if (budget.hasNonFinite) {
    return fail('Forecast geometry contains a non-finite coordinate.');
  }
  return null;
}

/** Validates one serialized outlook feature and its geometry. */
// @codescene(disable:"Complex Method", disable:"Complex Conditional")
export const validateFeature = (value: unknown): ImportValidationResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('Forecast feature is not a valid object.');
  }

  const feature = value as Feature;
  if (feature.type !== 'Feature') {
    return fail('Forecast geometry entry is missing "type": "Feature".');
  }

  const geometryResult = validateGeometry(feature.geometry);
  if (geometryResult) return geometryResult;

  const properties = feature.properties;
  if (properties !== null && properties !== undefined && (typeof properties !== 'object' || Array.isArray(properties))) {
    return fail('Forecast feature properties are invalid.');
  }

  return null;
};
