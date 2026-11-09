/** A compact key of the hazards drawn on the map, using the same colors as the areas. */
import React from 'react';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';
import { hazardHue } from './areaModel';

const MAX_ENTRIES = 5;

export const AreaLegend: React.FC<{ areas: MesoscaleArea[] }> = ({ areas }) => {
  const hazards = [...new Set(areas.map(area => area.hazard.trim()).filter(Boolean))];
  if (hazards.length === 0) return null;
  const shown = hazards.slice(0, MAX_ENTRIES);
  return (
    <aside className="mesoscale-area-legend" aria-label="Drawn areas">
      <ul>
        {shown.map(hazard => (
          <li key={hazard}>
            <span className="mesoscale-area-legend__swatch" style={{ '--hue': hazardHue(hazard) } as React.CSSProperties} aria-hidden="true" />
            <span className="mesoscale-area-legend__label">{hazard}</span>
          </li>
        ))}
        {hazards.length > shown.length ? <li className="mesoscale-area-legend__more">+{hazards.length - shown.length} more</li> : null}
      </ul>
    </aside>
  );
};
