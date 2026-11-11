/**
 * Mesoscale legend: one compact color ramp per visible layer, top layer first, with
 * the units and end values straight from the catalog. No values are derived here.
 */
import React from 'react';
import type { MesoscaleCatalogParameter } from '../../mesoscale';

/** A catalog parameter may omit its legend; every helper below treats that as an empty one. */
const stopsOf = (parameter: MesoscaleCatalogParameter): MesoscaleCatalogParameter['legend'] =>
  Array.isArray(parameter.legend) ? parameter.legend : [];

const rampFor = (parameter: MesoscaleCatalogParameter): string => {
  const colors = stopsOf(parameter).map(stop => stop.color).filter((color): color is string => Boolean(color));
  return colors.length > 1 ? `linear-gradient(90deg, ${colors.join(', ')})` : (colors[0] ?? 'transparent');
};

const endLabels = (parameter: MesoscaleCatalogParameter): [string, string] => {
  const stops = stopsOf(parameter);
  return [stops[0]?.label ?? '', stops[stops.length - 1]?.label ?? ''];
};

const LegendRow: React.FC<{ parameter: MesoscaleCatalogParameter }> = ({ parameter }) => {
  const [low, high] = endLabels(parameter);
  const isFixedStp = parameter.id === 'stp-fixed-surface';
  return (
    <li className="mesoscale-legend__row">
      <div className="mesoscale-legend__name">{parameter.displayName} <span>({parameter.units})</span></div>
      <div className="mesoscale-legend__ramp" style={{ background: rampFor(parameter) }} />
      {isFixedStp ? (
        <>
          <div className="mesoscale-legend__thresholds" role="group" aria-label="STP thresholds">
            {stopsOf(parameter).map(stop => <span key={stop.value}>{stop.value}</span>)}
          </div>
          <p className="mesoscale-legend__note">1 is a conventional reference, not a probability.</p>
        </>
      ) : <div className="mesoscale-legend__ends"><span>{low}</span><span>{high}</span></div>}
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
