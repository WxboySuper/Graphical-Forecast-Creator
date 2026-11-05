import type { GradeSnapshot } from '../../types/forecastGrade';

/** Returns whether a value is a non-null, non-array object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returns whether a value is a string or null. */
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/** Returns whether a value looks like the persisted grade card fields we read. */
const isGradeCardShape = (value: unknown): boolean =>
  isRecord(value) && typeof value.id === 'string' && typeof value.sourceLabel === 'string';

/** Validates a score row before the dashboard renders it. */
const isComponentShape = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return typeof value.key === 'string'
    && typeof value.label === 'string'
    && typeof value.weight === 'number'
    && typeof value.detail === 'string'
    && typeof value.applicable === 'boolean'
    && (value.applicable ? typeof value.score === 'number' : value.score === null);
};

/** Validates product fields used by the grade dashboard. */
const isProductGradeShape = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return typeof value.product === 'string'
    && typeof value.label === 'string'
    && typeof value.applicable === 'boolean'
    && (value.grade === null || typeof value.grade === 'number')
    && isStringOrNull(value.letter)
    && typeof value.reportCount === 'number'
    && Array.isArray(value.components)
    && value.components.every(isComponentShape)
    && (value.diagnostics === undefined
      || (Array.isArray(value.diagnostics) && value.diagnostics.every(isComponentShape)));
};

/** Returns whether a value looks like a package grade. */
const isPackageGradeShape = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return typeof value.formulaVersion === 'string'
    && (value.grade === null || typeof value.grade === 'number')
    && isStringOrNull(value.letter)
    && typeof value.dataQuality === 'string'
    && Array.isArray(value.products)
    && value.products.every(isProductGradeShape);
};

/** Validates the localStorage envelope before it reaches application state. */
export const isGradeSnapshot = (value: unknown): value is GradeSnapshot =>
  isRecord(value)
  && isGradeCardShape(value.card)
  && isPackageGradeShape(value.package)
  && isRecord(value.forecast)
  && isStringOrNull(value.reportDate);
