/**
 * Map styling for Mesoscale areas: a hazard-colored hatch over the model layers, a light halo
 * under the outline so it stays legible on any colormap, and a label with the valid window.
 */
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { hazardHue } from './areaModel';

const HATCH_SIZE = 12;
const hatchCache = new Map<string, CanvasPattern | null>();

/** A diagonal hatch in the hazard's color; null where canvas is unavailable (tests). */
const hatchPattern = (hue: number, selected: boolean): CanvasPattern | null => {
  const key = `${hue}:${selected}`;
  if (hatchCache.has(key)) return hatchCache.get(key) ?? null;
  const canvas = document.createElement('canvas');
  canvas.width = HATCH_SIZE;
  canvas.height = HATCH_SIZE;
  const context = canvas.getContext('2d');
  let pattern: CanvasPattern | null = null;
  if (context) {
    context.fillStyle = `hsl(${hue} 80% 50% / ${selected ? 0.22 : 0.1})`;
    context.fillRect(0, 0, HATCH_SIZE, HATCH_SIZE);
    context.strokeStyle = `hsl(${hue} 85% ${selected ? 34 : 40}% / ${selected ? 0.85 : 0.6})`;
    context.lineWidth = selected ? 2 : 1.5;
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
  hatchCache.set(key, pattern);
  return pattern;
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

export const areaStyle = (feature: Feature<Geometry>, selected: boolean): Style[] => {
  const hue = hazardHue(String(feature.get('hazard') ?? ''));
  const color = `hsl(${hue} 85% ${selected ? 34 : 40}%)`;
  const fill = hatchPattern(hue, selected) ?? `hsl(${hue} 80% 50% / ${selected ? 0.28 : 0.16})`;
  return [
    new Style({ stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.9)', width: selected ? 7 : 5 }) }),
    new Style({
      stroke: new Stroke({ color, width: selected ? 3.5 : 2.5, lineDash: selected ? undefined : [10, 5] }),
      fill: new Fill({ color: fill }),
      text: new Text({
        text: labelText(feature),
        font: '600 12.5px system-ui, sans-serif',
        fill: new Fill({ color: '#111' }),
        stroke: new Stroke({ color: '#fff', width: 3.5 }),
        overflow: true,
      }),
    }),
  ];
};
