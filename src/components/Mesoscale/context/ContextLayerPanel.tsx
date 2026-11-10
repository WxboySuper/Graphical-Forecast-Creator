/**
 * The "Radar and satellite" section of the Data tab: choose a radar and a satellite product, set their
 * opacity, and see how fresh each is. These are observations for context; they never change the product.
 */
import React from 'react';
import { formatAge, formatUtc } from '../SourcePanel';
import {
  RADAR_OPTIONS,
  SATELLITE_OPTIONS,
  type ContextRadarProduct,
  type ContextSatelliteProduct,
} from './contextLayers';
import type { ContextLayersController, LayerTimeState } from './useContextLayers';

interface RowProps<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  opacity: number;
  time: LayerTimeState;
  onProduct: (value: T) => void;
  onOpacity: (opacity: number) => void;
}

const ageMinutes = (time: string): number | null => {
  const parsed = Date.parse(time);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((Date.now() - parsed) / 60_000)) : null;
};

const TimeNote: React.FC<{ time: LayerTimeState }> = ({ time }) => {
  if (time.status === 'loading') return <p className="mesoscale-context__note" role="status">Loading the latest image…</p>;
  if (time.status === 'unavailable') return <p className="mesoscale-context__note mesoscale-context__note--warn" role="alert">Not available right now. Nothing older is shown in its place.</p>;
  if (time.status !== 'ready') return null;
  return <p className="mesoscale-context__note">Valid {formatUtc(time.time)} ({formatAge(ageMinutes(time.time))})</p>;
};

function ContextRow<T extends string>({ label, options, value, opacity, time, onProduct, onOpacity }: RowProps<T>): React.ReactElement {
  const active = value !== 'off';
  return (
    <div className="mesoscale-context__row">
      <label className="mesoscale-form__field">
        <span>{label}</span>
        <select value={value} onChange={(event) => onProduct(event.target.value as T)}>
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {active ? (
        <label className="mesoscale-opacity">
          <span>Opacity</span>
          <input type="range" min={0} max={100} step={5} value={Math.round(opacity * 100)} aria-label={`${label} opacity`} onChange={(event) => onOpacity(Number(event.target.value) / 100)} />
          <output>{Math.round(opacity * 100)}%</output>
        </label>
      ) : null}
      {active ? <TimeNote time={time} /> : null}
    </div>
  );
}

interface Props {
  controller: ContextLayersController;
  radarTime: LayerTimeState;
  satelliteTime: LayerTimeState;
}

export const ContextLayerPanel: React.FC<Props> = ({ controller, radarTime, satelliteTime }) => {
  const { state } = controller;
  return (
    <section className="mesoscale-section" aria-label="Radar and satellite">
      <h2 className="mesoscale-section__title">Radar and satellite</h2>
      <ContextRow<ContextRadarProduct>
        label="Radar"
        options={RADAR_OPTIONS}
        value={state.radar.product}
        opacity={state.radar.opacity}
        time={radarTime}
        onProduct={(product) => controller.setRadar({ product })}
        onOpacity={(opacity) => controller.setRadar({ opacity })}
      />
      <ContextRow<ContextSatelliteProduct>
        label="Satellite"
        options={SATELLITE_OPTIONS}
        value={state.satellite.product}
        opacity={state.satellite.opacity}
        time={satelliteTime}
        onProduct={(product) => controller.setSatellite({ product })}
        onOpacity={(opacity) => controller.setSatellite({ opacity })}
      />
      <p className="mesoscale-notice" role="note">Observations from NOAA for context. They are not part of your product and are not saved with it.</p>
    </section>
  );
};
