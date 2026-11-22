/** A compact key of the hazards drawn on the map, using the same looks as the areas. */
import React from 'react';
import { flag } from '../../../config/flags';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';
import { hazardHue } from './areaModel';
import { AreaSwatch } from './AreaSwatch';
import { activeAreaStyle, fullAreaStyle } from './areaStyleModel';

const MAX_ENTRIES = 5;

interface Entry { key: string; hazard: string; label: string; area: MesoscaleArea }

const lookKey = (area: MesoscaleArea): string => JSON.stringify(fullAreaStyle({ hazard: area.hazard, style: activeAreaStyle(area.style) }));

/**
 * One entry per distinct hazard and look. When a hazard is drawn with more than one look, each
 * entry names its area so the key is never ambiguous.
 */
const styledEntries = (areas: MesoscaleArea[]): Entry[] => {
  const byLook = new Map<string, Entry>();
  for (const area of areas) {
    const hazard = area.hazard.trim();
    const key = JSON.stringify([hazard, lookKey(area)]);
    if (hazard && !byLook.has(key)) byLook.set(key, { key, hazard, label: hazard, area });
  }
  const entries = [...byLook.values()];
  return entries.map(entry => (entries.filter(other => other.hazard === entry.hazard).length > 1
    ? { ...entry, label: `${entry.hazard} · ${entry.area.title}` }
    : entry));
};

const plainEntries = (areas: MesoscaleArea[]): Entry[] =>
  [...new Set(areas.map(area => area.hazard.trim()).filter(Boolean))]
    .map(hazard => ({ key: hazard, hazard, label: hazard, area: areas[0] }));

export const AreaLegend: React.FC<{ areas: MesoscaleArea[] }> = ({ areas }) => {
  const styling = flag('mesoscaleAreaStyling');
  const entries = styling ? styledEntries(areas) : plainEntries(areas);
  if (entries.length === 0) return null;
  const shown = entries.slice(0, MAX_ENTRIES);
  return (
    <aside className="mesoscale-area-legend" aria-label="Drawn areas">
      <ul>
        {shown.map(entry => (
          <li key={entry.key}>
            {styling
              ? <AreaSwatch className="mesoscale-area-legend__picture" hazard={entry.hazard} style={entry.area.style} />
              : <span className="mesoscale-area-legend__swatch" style={{ '--hue': hazardHue(entry.hazard) } as React.CSSProperties} aria-hidden="true" />}
            <span className="mesoscale-area-legend__label">{entry.label}</span>
          </li>
        ))}
        {entries.length > shown.length ? <li className="mesoscale-area-legend__more">+{entries.length - shown.length} more</li> : null}
      </ul>
    </aside>
  );
};
