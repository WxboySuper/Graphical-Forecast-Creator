/**
 * Mesoscale workspace: resolves the selected model's latest cycle and catalog,
 * then lays out the map, the data rail (source, layers), and the legend. Loading,
 * stale, partial, and failed data are always shown explicitly; an old cycle is
 * never presented as current.
 */
import React, { useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  useMesoscaleFrames,
  useMesoscaleLatest,
  type MesoscaleCatalog,
  type MesoscaleCatalogParameter,
  type MesoscaleLayerSpec,
} from '../../mesoscale';
import { isMesoscaleDemoData } from '../../mesoscale/fixtures/client';
import UnofficialBadge from '../Map/UnofficialBadge';
import { LayerPanel } from './LayerPanel';
import { MesoscaleLegend } from './MesoscaleLegend';
import { MesoscaleMap } from './MesoscaleMap';
import { SourcePanel, formatAge } from './SourcePanel';
import { StateMessage } from './StateMessage';
import { useMesoscaleSelection, type MesoscaleSelection } from './useMesoscaleSelection';
import './Mesoscale.css';

type Frame = MesoscaleCatalog['frames'][number];

const usableParameters = (frame: Frame): MesoscaleCatalogParameter[] =>
  frame.parameters.filter(parameter => parameter.status !== 'failed');

/** Maps the active layer stack onto the frame's parameters, dropping fields the frame lacks. */
const buildLayerSpecs = (parameters: MesoscaleCatalogParameter[], selection: MesoscaleSelection): MesoscaleLayerSpec[] => {
  const byId = new Map(parameters.map(parameter => [parameter.id, parameter]));
  return selection.activeLayers.flatMap(layer => {
    const parameter = byId.get(layer.id);
    return parameter ? [{ id: layer.id, parameter, opacity: layer.opacity }] : [];
  });
};

const FrameNotices: React.FC<{ frame: Frame; stale: boolean; ageMinutes: number | null }> = ({ frame, stale, ageMinutes }) => (
  <>
    {isMesoscaleDemoData() ? <p className="mesoscale-notice mesoscale-notice--demo" role="note">Demo data: placeholder imagery, not real model output.</p> : null}
    {stale ? <p className="mesoscale-notice mesoscale-notice--warn" role="status">This run is {formatAge(ageMinutes).replace(' old', '')} old. Newer data may not have arrived yet.</p> : null}
    {frame.status === 'partial' ? <p className="mesoscale-notice" role="status">Some fields are unavailable for this frame.</p> : null}
  </>
);

interface RailProps {
  selection: MesoscaleSelection;
  catalog: MesoscaleCatalog;
  frame: Frame;
  parameters: MesoscaleCatalogParameter[];
  ageMinutes: number | null;
  stale: boolean;
}

const DataRail: React.FC<RailProps> = ({ selection, catalog, frame, parameters, ageMinutes, stale }) => (
  <div className="mesoscale-rail__scroll">
    <FrameNotices frame={frame} stale={stale} ageMinutes={ageMinutes} />
    <SourcePanel
      modelId={selection.modelId}
      hour={frame.forecastHour}
      catalog={catalog}
      frame={frame}
      ageMinutes={ageMinutes}
      stale={stale}
      onSelectModel={selection.selectModel}
      onSelectHour={selection.selectHour}
    />
    <LayerPanel parameters={parameters} layers={selection.activeLayers} onChange={selection.setLayers} />
  </div>
);

const RailToggle: React.FC<{ open: boolean; onToggle: () => void }> = ({ open, onToggle }) => (
  <button type="button" className="mesoscale-rail-toggle" aria-expanded={open} aria-controls="mesoscale-rail" onClick={onToggle}>
    {open ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
    <span>{open ? 'Hide data' : 'Data'}</span>
  </button>
);

const LoadedWorkspace: React.FC<{ selection: MesoscaleSelection; cycleTime: string; onRetry: () => void }> = ({ selection, cycleTime, onRetry }) => {
  const frames = useMesoscaleFrames(selection.modelId, cycleTime);
  const [railOpen, setRailOpen] = useState(true);
  const catalog = 'data' in frames.result ? frames.result.data : null;
  const frame = catalog ? (catalog.frames.find(item => item.forecastHour === selection.forecastHour) ?? catalog.frames[0]) : undefined;
  const parameters = useMemo(() => (frame ? usableParameters(frame) : []), [frame]);
  const layerSpecs = useMemo(() => buildLayerSpecs(parameters, selection), [parameters, selection]);
  const legendParameters = useMemo(() => [...layerSpecs].reverse().map(spec => spec.parameter), [layerSpecs]);

  if (!catalog || !frame) {
    return <StateMessage result={frames.result} subject="the model catalog" onRetry={onRetry} />;
  }
  return (
    <div className={`mesoscale-workspace${railOpen ? '' : ' is-rail-closed'}`} data-testid="mesoscale-workspace">
      <aside id="mesoscale-rail" className="mesoscale-rail" aria-label="Model data" hidden={!railOpen}>
        <DataRail selection={selection} catalog={catalog} frame={frame} parameters={parameters} ageMinutes={frames.ageMinutes} stale={frames.stale} />
      </aside>
      <div className="mesoscale-stage">
        <MesoscaleMap layers={layerSpecs} domainBounds={catalog.domain.bounds} />
        <RailToggle open={railOpen} onToggle={() => setRailOpen(open => !open)} />
        <MesoscaleLegend parameters={legendParameters} />
        <div className="mesoscale-unofficial"><UnofficialBadge /></div>
      </div>
    </div>
  );
};

/** Resolves the latest cycle for the selected model, then shows the loaded workspace. */
export const MesoscaleWorkspace: React.FC = () => {
  const selection = useMesoscaleSelection();
  const [retryKey, setRetryKey] = useState(0);
  const latest = useMesoscaleLatest(selection.modelId);
  const cycleTime = 'data' in latest.result ? latest.result.data.cycleTime : null;
  const retry = () => setRetryKey(key => key + 1);

  if (!cycleTime) {
    return <StateMessage result={latest.result} subject={`the latest ${selection.modelId.toUpperCase()} run`} onRetry={retry} />;
  }
  return <LoadedWorkspace key={`${selection.modelId}-${retryKey}`} selection={selection} cycleTime={cycleTime} onRetry={retry} />;
};
