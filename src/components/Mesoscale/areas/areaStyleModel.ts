/**
 * Pure look of an area: which fields a forecaster has customized, what the controls should show,
 * and the color helpers the map and the legend share. The look only applies while the
 * `mesoscaleAreaStyling` flag is on; with it off every area renders from its hazard as before.
 */
import { flag } from '../../../config/flags';
import type { MesoscaleAreaStyle, MesoscaleFillPattern, MesoscaleOutlineDash } from '../../../store/mesoscaleSlice';
import { hazardHue } from './areaModel';

export const DEFAULT_OUTLINE_WIDTH = 2.5;
export const DEFAULT_HATCH_OPACITY = 0.6;
export const DEFAULT_SOLID_OPACITY = 0.4;

/** The style to honor: the area's own while the flag is on, nothing while it is off. */
export const activeAreaStyle = (style: MesoscaleAreaStyle | undefined): MesoscaleAreaStyle | undefined =>
  (flag('mesoscaleAreaStyling') ? style : undefined);

export const hasCustomFill = (style: MesoscaleAreaStyle | undefined): boolean =>
  Boolean(style && (style.fillPattern !== undefined || style.fillColor !== undefined || style.fillOpacity !== undefined));

export const isStyled = (style: MesoscaleAreaStyle | undefined): boolean => Boolean(style && Object.keys(style).length > 0);

const hexByte = (value: number): string => Math.round(value * 255).toString(16).padStart(2, '0');

/** `#rrggbb` for an HSL color (hue in degrees, saturation and lightness 0 to 100). */
export const hslToHex = (hue: number, saturation: number, lightness: number): string => {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): number => {
    const k = (n + hue / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${hexByte(channel(0))}${hexByte(channel(8))}${hexByte(channel(4))}`;
};

const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

export const withAlpha = (hex: string, alpha: number): string => {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export const luminance = (hex: string): number => {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** A halo that separates an outline from the map: light under dark outlines, dark under light ones. */
export const haloColor = (outlineHex: string): string =>
  (luminance(outlineHex) > 0.5 ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.9)');

export interface FullAreaStyle {
  fillPattern: MesoscaleFillPattern;
  fillColor: string;
  fillOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  outlineDash: MesoscaleOutlineDash;
}

/** Hazard-derived colors in hex, as the controls and the legend show them. */
export const hazardColors = (hazard: string): { fill: string; outline: string } => {
  const hue = hazardHue(hazard);
  return { fill: hslToHex(hue, 80, 50), outline: hslToHex(hue, 85, 40) };
};

/** Every field filled in: the customized value, else what the hazard default looks like. */
export const fullAreaStyle = (hazard: string, style: MesoscaleAreaStyle | undefined): FullAreaStyle => {
  const colors = hazardColors(hazard);
  const fillPattern = style?.fillPattern ?? 'hatch';
  return {
    fillPattern,
    fillColor: style?.fillColor ?? colors.fill,
    fillOpacity: style?.fillOpacity ?? (fillPattern === 'solid' ? DEFAULT_SOLID_OPACITY : DEFAULT_HATCH_OPACITY),
    outlineColor: style?.outlineColor ?? colors.outline,
    outlineWidth: style?.outlineWidth ?? DEFAULT_OUTLINE_WIDTH,
    outlineDash: style?.outlineDash ?? 'dashed',
  };
};

/** Dash lengths in pixels for a line width; dots and dash-dots use a round cap, so dots are short. */
export const dashArray = (dash: MesoscaleOutlineDash, width: number, scale = 1): number[] | undefined => {
  const w = Math.max(width, 1.5);
  const sizes: Record<MesoscaleOutlineDash, number[] | undefined> = {
    solid: undefined,
    dashed: [w * 3 + 4, w * 1.6 + 3],
    dotted: [0.1, w * 2 + 2],
    'dash-dot': [w * 3 + 4, w * 1.4 + 3, 0.1, w * 1.4 + 3],
  };
  return sizes[dash]?.map(v => v * scale);
};

export const usesRoundCap = (dash: MesoscaleOutlineDash): boolean => dash === 'dotted' || dash === 'dash-dot';
