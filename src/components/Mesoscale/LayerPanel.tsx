/**
 * Layer panel: an "On the map" stack (top layer first, with opacity, reorder, and
 * remove controls) above a themed list of every field the current frame offers.
 * Fields the frame does not carry are simply absent, never faked.
 */
import React from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { MesoscaleCatalogParameter } from '../../mesoscale';
import { groupParameters } from './layerGroups';
import { filterExposedMesoscaleParameters } from './layerExposure';
import { addLayer, moveLayer, removeLayer, setOpacity, type ActiveLayers } from './layerOrdering';

interface LayerPanelProps {
  parameters: MesoscaleCatalogParameter[];
  layers: ActiveLayers;
  onChange: (layers: ActiveLayers) => void;
}

interface ActiveLayerRowProps {
  parameter: MesoscaleCatalogParameter;
  opacity: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpacity: (opacity: number) => void;
  onMove: (direction: 1 | -1) => void;
  onRemove: () => void;
}

const LayerTools: React.FC<Pick<ActiveLayerRowProps, 'parameter' | 'canMoveUp' | 'canMoveDown' | 'onMove' | 'onRemove'>> = ({
  parameter, canMoveUp, canMoveDown, onMove, onRemove,
}) => (
  <span className="mesoscale-layer__tools">
    <button type="button" className="mesoscale-icon" aria-label={`Move ${parameter.displayName} up`} disabled={!canMoveUp} onClick={() => onMove(1)}><ArrowUp aria-hidden="true" /></button>
    <button type="button" className="mesoscale-icon" aria-label={`Move ${parameter.displayName} down`} disabled={!canMoveDown} onClick={() => onMove(-1)}><ArrowDown aria-hidden="true" /></button>
    <button type="button" className="mesoscale-icon" aria-label={`Remove ${parameter.displayName}`} onClick={onRemove}><X aria-hidden="true" /></button>
  </span>
);

const OpacityControl: React.FC<{ name: string; opacity: number; onChange: (opacity: number) => void }> = ({ name, opacity, onChange }) => (
  <label className="mesoscale-opacity">
    <span>Opacity</span>
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={Math.round(opacity * 100)}
      aria-label={`${name} opacity`}
      onChange={(event) => onChange(Number(event.target.value) / 100)}
    />
    <output>{Math.round(opacity * 100)}%</output>
  </label>
);

const ActiveLayerRow: React.FC<ActiveLayerRowProps> = ({ onOpacity, opacity, ...tools }) => (
  <li className="mesoscale-layer">
    <div className="mesoscale-layer__head">
      <span className="mesoscale-layer__name">{tools.parameter.displayName}</span>
      <LayerTools {...tools} />
    </div>
    <OpacityControl name={tools.parameter.displayName} opacity={opacity} onChange={onOpacity} />
  </li>
);

const ActiveStack: React.FC<LayerPanelProps> = ({ parameters, layers, onChange }) => {
  const byId = new Map(parameters.map(parameter => [parameter.id, parameter]));
  const topFirst = [...layers].reverse().filter(layer => byId.has(layer.id));
  if (topFirst.length === 0) return <p className="mesoscale-empty">No layers on the map. Add one below.</p>;
  return (
    <ol className="mesoscale-stack" aria-label="Layers on the map, top first">
      {topFirst.map((layer, index) => (
        <ActiveLayerRow
          key={layer.id}
          parameter={byId.get(layer.id)!}
          opacity={layer.opacity}
          canMoveUp={index > 0}
          canMoveDown={index < topFirst.length - 1}
          onOpacity={(opacity) => onChange(setOpacity(layers, layer.id, opacity))}
          onMove={(direction) => onChange(moveLayer(layers, layer.id, direction))}
          onRemove={() => onChange(removeLayer(layers, layer.id))}
        />
      ))}
    </ol>
  );
};

const FieldButton: React.FC<{ parameter: MesoscaleCatalogParameter; active: boolean; onToggle: () => void }> = ({ parameter, active, onToggle }) => (
  <button type="button" className="mesoscale-field" aria-pressed={active} onClick={onToggle}>
    {active ? <span className="mesoscale-field__check" aria-hidden="true">✓</span> : <Plus className="mesoscale-field__plus" aria-hidden="true" />}
    <span>{parameter.displayName}</span>
  </button>
);

const AvailableFields: React.FC<LayerPanelProps> = ({ parameters, layers, onChange }) => (
  <div className="mesoscale-available">
    {groupParameters(parameters).map(group => (
      <div key={group.id} className="mesoscale-group">
        <h3 className="mesoscale-group__title">{group.label}</h3>
        <ul className="mesoscale-group__list">
          {group.parameters.map(parameter => {
            const active = layers.some(layer => layer.id === parameter.id);
            const toggle = () => onChange(active ? removeLayer(layers, parameter.id) : addLayer(layers, parameter.id));
            return <li key={parameter.id}><FieldButton parameter={parameter} active={active} onToggle={toggle} /></li>;
          })}
        </ul>
      </div>
    ))}
  </div>
);

export const LayerPanel: React.FC<LayerPanelProps> = (props) => {
  const exposedProps = { ...props, parameters: filterExposedMesoscaleParameters(props.parameters) };
  return (
    <section className="mesoscale-section" aria-labelledby="mesoscale-layers-heading">
      <h2 id="mesoscale-layers-heading" className="mesoscale-section__title">On the map</h2>
      <ActiveStack {...exposedProps} />
      <h2 className="mesoscale-section__title mesoscale-section__title--sub">Fields</h2>
      <AvailableFields {...exposedProps} />
    </section>
  );
};
