import {
  CUSTOM_PRODUCT_LIMITS,
  type CustomCategoryStyle,
  type CustomCategoryTemplate,
} from '../types/customProducts';
import { hasOnlyKeys, isBoundedText, isNonNegativeInteger, isRecord } from './customValidationPrimitives';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const HATCH_PATTERNS = new Set(['none', 'diagonal', 'reverse-diagonal', 'crosshatch']);

const isUnitInterval = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR.test(value);

const isStrokeWidth = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8;

const isHatchPattern = (value: unknown): boolean =>
  typeof value === 'string' && HATCH_PATTERNS.has(value);

/** Validates a complete category style without accepting unknown fields. */
export const isCustomCategoryStyle = (value: unknown): value is CustomCategoryStyle => {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ['fillColor', 'fillOpacity', 'strokeColor', 'strokeOpacity', 'strokeWidth', 'hatch'])) return false;
  return isHexColor(value.fillColor)
    && isUnitInterval(value.fillOpacity)
    && isHexColor(value.strokeColor)
    && isUnitInterval(value.strokeOpacity)
    && isStrokeWidth(value.strokeWidth)
    && isHatchPattern(value.hatch);
};

/** Validates one bounded ordered category definition. */
export const isCustomCategoryTemplate = (value: unknown): value is CustomCategoryTemplate => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'label', 'order', 'style'])) return false;
  return isBoundedText(value.id, CUSTOM_PRODUCT_LIMITS.labelLength)
    && isBoundedText(value.label, CUSTOM_PRODUCT_LIMITS.labelLength)
    && isNonNegativeInteger(value.order)
    && isCustomCategoryStyle(value.style);
};

/** Validates category limits, unique identifiers, and contiguous ordering. */
export const isCustomCategoryList = (value: unknown): value is CustomCategoryTemplate[] => {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (value.length > CUSTOM_PRODUCT_LIMITS.categoriesPerProduct || !value.every(isCustomCategoryTemplate)) return false;
  const ids = new Set(value.map((category) => category.id));
  return ids.size === value.length && value.every((category, index) => category.order === index);
};
