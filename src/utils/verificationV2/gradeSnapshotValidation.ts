import type { GradeSnapshot } from '../../types/forecastGrade';
import { isProductGradeShape } from './gradeProductValidation';

/** Returns whether a value is a non-null, non-array object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returns whether a value is a string or null. */
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/** Returns whether a value looks like the persisted grade card fields we read. */
const isGradeCardShape = (value: unknown): boolean =>
  isRecord(value) && typeof value.id === 'string' && typeof value.sourceLabel === 'string';

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
