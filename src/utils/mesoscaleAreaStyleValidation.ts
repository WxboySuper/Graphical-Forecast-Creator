/**
 * Validation for the optional per-area `style`. Saved data is untrusted (hand-edited files, older
 * builds), so loading goes through `sanitizeAreaStyle`, which clamps or drops bad fields rather than
 * rejecting the whole save; `isAreaStyle` is the strict check the save validator applies afterwards.
 */
import type { MesoscaleAreaStyle, MesoscaleFillPattern, MesoscaleOutlineDash } from '../store/mesoscaleSlice';
import { isRecord } from './forecastWorkspaceEnvelope';

export const FILL_PATTERNS: readonly MesoscaleFillPattern[] = ['none', 'hatch', 'solid'];
export const OUTLINE_DASHES: readonly MesoscaleOutlineDash[] = ['solid', 'dashed', 'dotted', 'dash-dot'];
export const MIN_FILL_OPACITY = 0.05;
export const MAX_FILL_OPACITY = 1;
export const MIN_OUTLINE_WIDTH = 1;
export const MAX_OUTLINE_WIDTH = 8;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const STYLE_KEYS = ['fillPattern', 'fillColor', 'fillOpacity', 'outlineColor', 'outlineWidth', 'outlineDash'];

const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX_COLOR.test(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number): boolean => isFiniteNumber(value) && value >= min && value <= max;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const hasOnlyStyleKeys = (value: Record<string, unknown>): boolean => Object.keys(value).every((key) => STYLE_KEYS.includes(key));
const isOptionalEnum = (value: unknown, allowed: readonly string[]): boolean => value === undefined || allowed.includes(value as string);
const isOptionalColor = (value: unknown): boolean => value === undefined || isHexColor(value);
const isOptionalRange = (value: unknown, range: [number, number]): boolean => value === undefined || inRange(value, range[0], range[1]);

/** The per-field rules, so each field has one small check. */
const STYLE_FIELD_RULES: Array<(style: Record<string, unknown>) => boolean> = [
  (style) => isOptionalEnum(style.fillPattern, FILL_PATTERNS),
  (style) => isOptionalEnum(style.outlineDash, OUTLINE_DASHES),
  (style) => isOptionalColor(style.fillColor),
  (style) => isOptionalColor(style.outlineColor),
  (style) => isOptionalRange(style.fillOpacity, [MIN_FILL_OPACITY, MAX_FILL_OPACITY]),
  (style) => isOptionalRange(style.outlineWidth, [MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH]),
];

/** Strict check: only known fields, each within its limits. */
export const isAreaStyle = (value: unknown): value is MesoscaleAreaStyle =>
  isRecord(value) && hasOnlyStyleKeys(value) && STYLE_FIELD_RULES.every((rule) => rule(value));

const pickEnum = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;
const pickColor = (value: unknown): string | undefined => (isHexColor(value) ? value.toLowerCase() : undefined);
const pickNumber = (value: unknown, min: number, max: number): number | undefined =>
  (isFiniteNumber(value) ? clamp(value, min, max) : undefined);

/** Clamps numbers, drops unknown or invalid fields, and returns undefined when nothing usable is left. */
export const sanitizeAreaStyle = (value: unknown): MesoscaleAreaStyle | undefined => {
  if (!isRecord(value)) return undefined;
  const style: MesoscaleAreaStyle = {};
  const fields: Array<[keyof MesoscaleAreaStyle, unknown]> = [
    ['fillPattern', pickEnum(value.fillPattern, FILL_PATTERNS)],
    ['fillColor', pickColor(value.fillColor)],
    ['fillOpacity', pickNumber(value.fillOpacity, MIN_FILL_OPACITY, MAX_FILL_OPACITY)],
    ['outlineColor', pickColor(value.outlineColor)],
    ['outlineWidth', pickNumber(value.outlineWidth, MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH)],
    ['outlineDash', pickEnum(value.outlineDash, OUTLINE_DASHES)],
  ];
  for (const [key, picked] of fields) if (picked !== undefined) (style as Record<string, unknown>)[key] = picked;
  return Object.keys(style).length > 0 ? style : undefined;
};

/**
 * Returns a copy of a saved Mesoscale product with every area's `style` sanitized. Anything that is
 * not an array of area records is returned untouched so the normal validator reports it.
 */
export const sanitizeSavedAreaStyles = (product: unknown): unknown => {
  if (!isRecord(product) || !Array.isArray(product.areas)) return product;
  if (!product.areas.some((area) => isRecord(area) && 'style' in area)) return product;
  const areas = product.areas.map((area) => {
    if (!isRecord(area) || !('style' in area)) return area;
    const { style, ...rest } = area;
    const clean = sanitizeAreaStyle(style);
    return clean ? { ...rest, style: clean } : rest;
  });
  return { ...product, areas };
};
