/**
 * Mesoscale legend: one compact color ramp per visible layer, top layer first, with
 * the units and end values straight from the catalog. No values are derived here.
 */
import React from 'react';
import type { MesoscaleCatalogParameter } from '../../mesoscale';

const rampFor = (parameter: MesoscaleCatalogParameter): string => {
  const colors = parameter.legend.map(stop => stop.color).filter((color): color is string => Boolean(color));
  return colors.length > 1 ? `linear-gradient(90deg, ${colors.join(', ')})` : (colors[0] ?? 'transparent');
};

const endLabels = (parameter: MesoscaleCatalogParameter): [string, string] => {
  const stops = parameter.legend;
  return [stops[0]?.label ?? '', stops[stops.length - 1]?.label ?? ''];
};

const LegendRow: React.FC<{ parameter: MesoscaleCatalogParameter }> = ({ parameter }) => {
  const [low, high] = endLabels(parameter);
  return (
    <li className="mesoscale-legend__row">
      <div className="mesoscale-legend__name">{parameter.displayName} <span>({parameter.units})</span></div>
      <div className="mesoscale-legend__ramp" style={{ background: rampFor(parameter) }} />
      <div className="mesoscale-legend__ends"><span>{low}</span><span>{high}</span></div>
    </li>
  );
};

export const MesoscaleLegend: React.FC<{ parameters: MesoscaleCatalogParameter[] }> = ({ parameters }) => {
  if (parameters.length === 0) return null;
  return (
    <aside className="mesoscale-legend" aria-label="Map legend">
      <ul className="mesoscale-legend__list">
        {parameters.map(parameter => <LegendRow key={parameter.id} parameter={parameter} />)}
      </ul>
    </aside>
  );
};
