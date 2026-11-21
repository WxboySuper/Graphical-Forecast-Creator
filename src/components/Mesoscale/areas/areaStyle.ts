/**
 * Map styling for Mesoscale areas: a hazard-colored hatch over the model layers, a halo under the
 * outline so it stays legible on any colormap, and a label with the valid window. A forecaster's
 * custom style (flag `mesoscaleAreaStyling`) overrides the hazard defaults field by field.
 */
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import { Fill, Stroke, Style, Text } from 'ol/style';
import type { MesoscaleAreaStyle } from '../../../store/mesoscaleSlice';
import { hazardHue } from './areaModel';
import {
  DEFAULT_HATCH_OPACITY, DEFAULT_OUTLINE_WIDTH, activeAreaStyle, dashArray, fullAreaStyle, haloColor,
  hasCustomFill, usesRoundCap, withAlpha,
} from './areaStyleModel';

const HATCH_SIZE = 12;
const HATCH_CACHE_LIMIT = 120;
const hatchCache = new Map<string, CanvasPattern | null>();

interface HatchPaint { background: string; line: string; lineWidth: number }

/** A diagonal hatch; null where canvas is unavailable (tests). */
const hatchPattern = ({ background, line, lineWidth }: HatchPaint): CanvasPattern | null => {
  const key = `${background}|${line}|${lineWidth}`;
  if (hatchCache.has(key)) return hatchCache.get(key) ?? null;
  const canvas = document.createElement('canvas');
  canvas.width = HATCH_SIZE;
  canvas.height = HATCH_SIZE;
  const context = canvas.getContext('2d');
  let pattern: CanvasPattern | null = null;
  if (context) {
    context.fillStyle = background;
    context.fillRect(0, 0, HATCH_SIZE, HATCH_SIZE);
    context.strokeStyle = line;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(-1, HATCH_SIZE + 1);
    context.lineTo(HATCH_SIZE + 1, -1);
    context.moveTo(-1, 1);
    context.lineTo(1, -1);
    context.moveTo(HATCH_SIZE - 1, HATCH_SIZE + 1);
    context.lineTo(HATCH_SIZE + 1, HATCH_SIZE - 1);
    context.stroke();
    pattern = context.createPattern(canvas, 'repeat');
  }
  // Fill strength is a slider, so bound the number of cached patterns.
  if (hatchCache.size >= HATCH_CACHE_LIMIT) hatchCache.clear();
  hatchCache.set(key, pattern);
  return pattern;
};

/** The hazard hatch, drawn exactly as it always has been. */
const hazardFill = (hue: number, selected: boolean): string | CanvasPattern =>
  hatchPattern({
    background: `hsl(${hue} 80% 50% / ${selected ? 0.22 : 0.1})`,
    line: `hsl(${hue} 85% ${selected ? 34 : 40}% / ${selected ? 0.85 : 0.6})`,
    lineWidth: selected ? 2 : 1.5,
  }) ?? `hsl(${hue} 80% 50% / ${selected ? 0.28 : 0.16})`;

/** The fill for a customized area, or null for outline only. */
const customFill = (hazard: string, style: MesoscaleAreaStyle, selected: boolean): string | CanvasPattern | null => {
  const full = fullAreaStyle(hazard, style);
  if (full.fillPattern === 'none') return null;
  if (full.fillPattern === 'solid') return withAlpha(full.fillColor, full.fillOpacity);
  const opacity = style.fillOpacity ?? DEFAULT_HATCH_OPACITY;
  return hatchPattern({
    background: withAlpha(full.fillColor, opacity * 0.25),
    line: withAlpha(full.fillColor, opacity),
    lineWidth: selected ? 2 : 1.5,
  }) ?? withAlpha(full.fillColor, opacity * 0.3);
};

const pad = (value: number): string => String(value).padStart(2, '0');
const hourZ = (iso: string): string => `${pad(new Date(iso).getUTCHours())}Z`;

/** "13Z to 16Z", the label's second line. */
export const windowLabel = (validStart: string, validEnd: string): string => `${hourZ(validStart)} to ${hourZ(validEnd)}`;

const labelText = (feature: Feature<Geometry>): string => {
  const title = String(feature.get('title') ?? '');
  const start = feature.get('validStart') as string | undefined;
  const end = feature.get('validEnd') as string | undefined;
  return start && end ? `${title}\n${windowLabel(start, end)}` : title;
};

const labelStyle = (feature: Feature<Geometry>): Text => new Text({
  text: labelText(feature),
  font: '600 12.5px system-ui, sans-serif',
  fill: new Fill({ color: '#111' }),
  stroke: new Stroke({ color: '#fff', width: 3.5 }),
  overflow: true,
});

/** The outline: customized fields win, the rest follows the hazard and selection as before. */
const outlineStroke = (hue: number, style: MesoscaleAreaStyle | undefined, selected: boolean): Stroke => {
  const width = (style?.outlineWidth ?? DEFAULT_OUTLINE_WIDTH) + (selected ? 1 : 0);
  const color = style?.outlineColor ?? `hsl(${hue} 85% ${selected ? 34 : 40}%)`;
  const dash = style?.outlineDash;
  if (dash === undefined) return new Stroke({ color, width, lineDash: selected ? undefined : [10, 5] });
  return new Stroke({ color, width, lineDash: dashArray(dash, width), lineCap: usesRoundCap(dash) ? 'round' : 'butt' });
};

export const areaStyle = (feature: Feature<Geometry>, selected: boolean): Style[] => {
  const hazard = String(feature.get('hazard') ?? '');
  const hue = hazardHue(hazard);
  const style = activeAreaStyle(feature.get('areaStyle') as MesoscaleAreaStyle | undefined);
  const fill = hasCustomFill(style) ? customFill(hazard, style as MesoscaleAreaStyle, selected) : hazardFill(hue, selected);
  const stroke = outlineStroke(hue, style, selected);
  const haloWidth = (stroke.getWidth() ?? 0) + (selected ? 3.5 : 2.5);
  const haloPaint = style?.outlineColor ? haloColor(style.outlineColor) : 'rgba(255, 255, 255, 0.9)';
  return [
    new Style({ stroke: new Stroke({ color: haloPaint, width: haloWidth }) }),
    new Style({ stroke, fill: fill ? new Fill({ color: fill }) : undefined, text: labelStyle(feature) }),
  ];
};
