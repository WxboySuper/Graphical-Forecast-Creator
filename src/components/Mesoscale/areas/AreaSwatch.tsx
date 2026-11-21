/**
 * A small picture of an area's look (fill, outline, dash) for the legend, the area list, and the
 * style controls. It draws the same halo the map does, so a very light outline stays visible on
 * the light or dark panel behind it.
 */
import React, { useId } from 'react';
import type { MesoscaleAreaStyle } from '../../../store/mesoscaleSlice';
import { activeAreaStyle, dashPattern, fullAreaStyle, haloColor, rgbOf, withAlpha } from './areaStyleModel';

interface Props {
  hazard: string;
  style: MesoscaleAreaStyle | undefined;
  width?: number;
  height?: number;
  className?: string;
}

const STROKE_CAP = 4;

export const AreaSwatch: React.FC<Props> = ({ hazard, style, width = 22, height = 14, className }) => {
  const patternId = useId();
  const full = fullAreaStyle({ hazard, style: activeAreaStyle(style) });
  // The swatch is small, so a heavy outline is drawn lighter than on the map.
  const stroke = Math.min(full.outlineWidth, STROKE_CAP);
  const inset = stroke / 2 + 1.5;
  const tint = (alpha: number): string => withAlpha({ hex: full.fillColor, alpha });
  const fill = full.fillPattern === 'solid' ? tint(full.fillOpacity) : `url(#${patternId})`;
  const { lineDash, round } = dashPattern({ dash: full.outlineDash, width: stroke, scale: 0.6 });
  const dash = lineDash?.join(' ');
  const rect = { x: inset, y: inset, width: width - inset * 2, height: height - inset * 2, rx: 2 };
  return (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={tint(full.fillOpacity * 0.25)} />
          <line x1="0" y1="0" x2="0" y2="5" stroke={tint(full.fillOpacity)} strokeWidth="1.8" />
        </pattern>
      </defs>
      {full.fillPattern === 'none' ? null : <rect {...rect} fill={fill} />}
      <rect {...rect} fill="none" stroke={haloColor(rgbOf(full.outlineColor))} strokeWidth={stroke + 1.6} />
      <rect {...rect} fill="none" stroke={full.outlineColor} strokeWidth={stroke} strokeDasharray={dash} strokeLinecap={round ? 'round' : 'butt'} />
    </svg>
  );
};
