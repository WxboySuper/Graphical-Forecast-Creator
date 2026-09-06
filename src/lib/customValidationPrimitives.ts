/** Returns true only for non-array object records. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Rejects fields outside an explicit persistence contract. */
export const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

/** Validates trimmed non-empty text against a bounded length. */
export const isBoundedText = (value: unknown, max: number = CUSTOM_PRODUCT_LIMITS.labelLength): value is string =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;

/** Validates a whole number that may be zero. */
export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
import { CUSTOM_PRODUCT_LIMITS } from '../types/customProducts';
