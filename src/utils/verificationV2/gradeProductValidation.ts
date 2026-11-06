/** Returns whether a value is a non-null, non-array object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validates score fields rendered by the grade dashboard. */
const hasComponentFields = (value: Record<string, unknown>): boolean => [
  typeof value.key === 'string',
  typeof value.label === 'string',
  typeof value.weight === 'number',
  typeof value.detail === 'string',
  typeof value.applicable === 'boolean',
].every(Boolean);

/** Validates the score for an applicable or unavailable component. */
const hasValidScore = (value: Record<string, unknown>): boolean =>
  value.applicable ? typeof value.score === 'number' : value.score === null;

/** Validates a score row before the dashboard renders it. */
const isComponentShape = (value: unknown): boolean =>
  isRecord(value) && hasComponentFields(value) && hasValidScore(value);

/** Returns whether optional diagnostics contain valid score rows. */
const hasValidDiagnostics = (value: Record<string, unknown>): boolean =>
  value.diagnostics === undefined
  || (Array.isArray(value.diagnostics) && value.diagnostics.every(isComponentShape));

/** Returns whether the product contains its required score rows. */
const hasValidComponents = (value: Record<string, unknown>): boolean =>
  Array.isArray(value.components) && value.components.every(isComponentShape);

/** Validates product fields used by the grade dashboard. */
export const isProductGradeShape = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const hasRequiredFields = [
    typeof value.product === 'string',
    typeof value.label === 'string',
    typeof value.applicable === 'boolean',
    value.grade === null || typeof value.grade === 'number',
    value.letter === null || typeof value.letter === 'string',
    typeof value.reportCount === 'number',
  ].every(Boolean);
  return hasRequiredFields && hasValidComponents(value) && hasValidDiagnostics(value);
};
