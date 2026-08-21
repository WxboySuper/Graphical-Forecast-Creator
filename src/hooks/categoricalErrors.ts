/** Raised when automatic categorical derivation cannot produce a complete result. */
export class CategoricalDerivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoricalDerivationError';
  }
}

/** Returns a stable, actionable message for an unknown derivation failure. */
export const toDerivationErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof CategoricalDerivationError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallback;
};
