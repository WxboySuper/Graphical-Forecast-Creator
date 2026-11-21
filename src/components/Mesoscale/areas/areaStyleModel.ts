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

export interface Hsl { hue: number; saturation: number; lightness: number }
export interface Rgb { r: number; g: number; b: number }
/** A `#rrggbb` color with an opacity, the one way colors are turned into CSS `rgba()`. */
export interface Tint { hex: string; alpha: number }
/** What the look of an area is derived from: its hazard (default colors) and its custom style. */
export interface AreaLookSource { hazard: string; style?: MesoscaleAreaStyle }
export interface DashSpec { dash: MesoscaleOutlineDash; width: number; scale?: number }

const toHexByte = (channel: number): string => Math.round(channel * 255).toString(16).padStart(2, '0');

/** `#rrggbb` for an HSL color (hue in degrees, saturation and lightness 0 to 100). */
export const hslToHex = ({ hue, saturation, lightness }: Hsl): string => {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): number => {
    const k = (n + hue / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${toHexByte(channel(0))}${toHexByte(channel(8))}${toHexByte(channel(4))}`;
};

export const rgbOf = (hex: string): Rgb => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return { r, g, b };
};

export const withAlpha = ({ hex, alpha }: Tint): string => {
  const { r, g, b } = rgbOf(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const linearChannel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export const luminance = ({ r, g, b }: Rgb): number =>
  0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);

/** A halo that separates an outline from the map: light under dark outlines, dark under light ones. */
export const haloColor = (outline: Rgb): string =>
  (luminance(outline) > 0.5 ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.9)');

export interface FullAreaStyle {
  fillPattern: MesoscaleFillPattern;
  fillColor: string;
  fillOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  outlineDash: MesoscaleOutlineDash;
}

/** Hazard-derived colors in hex, as the controls and the legend show them. */
export const hazardColors = ({ hazard }: AreaLookSource): { fill: string; outline: string } => {
  const hue = hazardHue(hazard);
  return { fill: hslToHex({ hue, saturation: 80, lightness: 50 }), outline: hslToHex({ hue, saturation: 85, lightness: 40 }) };
};

/** Every field filled in: the customized value, else what the hazard default looks like. */
export const fullAreaStyle = (look: AreaLookSource): FullAreaStyle => {
  const { style } = look;
  const colors = hazardColors(look);
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

/** The dash array and line cap for an outline; dots and dash-dots use a round cap, so their dots are short. */
export const dashPattern = ({ dash, width, scale = 1 }: DashSpec): { lineDash: number[] | undefined; round: boolean } => {
  const w = Math.max(width, 1.5);
  const sizes: Record<MesoscaleOutlineDash, number[] | undefined> = {
    solid: undefined,
    dashed: [w * 3 + 4, w * 1.6 + 3],
    dotted: [0.1, w * 2 + 2],
    'dash-dot': [w * 3 + 4, w * 1.4 + 3, 0.1, w * 1.4 + 3],
  };
  return { lineDash: sizes[dash]?.map(v => v * scale), round: dash === 'dotted' || dash === 'dash-dot' };
};
