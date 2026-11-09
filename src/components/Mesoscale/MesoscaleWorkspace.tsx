/**
 * Mesoscale workspace: resolves the selected model's latest cycle and catalog,
 * then lays out the map, the data rail (source, layers), and the legend. Loading,
 * stale, partial, and failed data are always shown explicitly; an old cycle is
 * never presented as current.
 */
import React, { useEffect, useMemo, useState } from 'react';
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
import { SourcePanel, formatDuration } from './SourcePanel';
import { StateMessage } from './StateMessage';
import { AreaLegend } from './areas/AreaLegend';
import { AreaToolbar } from './areas/AreaToolbar';
import { AreasPanel } from './areas/AreasPanel';
import { DiscussionPanel } from './areas/DiscussionPanel';
import { MesoscaleAreaLayer } from './areas/MesoscaleAreaLayer';
import { useMesoscaleAreas, type MesoscaleAreasController } from './areas/useMesoscaleAreas';
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

/** Words the stale notice, including the case where the run's age cannot be computed. */
const staleMessage = (ageMinutes: number | null): string =>
  ageMinutes === null
    ? 'This run may be out of date: its age is unknown. Newer data may not have arrived yet.'
    : `This run is ${formatDuration(ageMinutes)} old. Newer data may not have arrived yet.`;

const FrameNotices: React.FC<{ frame: Frame; stale: boolean; ageMinutes: number | null }> = ({ frame, stale, ageMinutes }) => (
  <>
    {isMesoscaleDemoData() ? <p className="mesoscale-notice mesoscale-notice--demo" role="note">Demo data: placeholder imagery, not real model output.</p> : null}
    {stale ? <p className="mesoscale-notice mesoscale-notice--warn" role="status">{staleMessage(ageMinutes)}</p> : null}
    {frame.status === 'partial' ? <p className="mesoscale-notice" role="status">Some fields are unavailable for this frame.</p> : null}
  </>
);

type RailTab = 'data' | 'areas' | 'discussion';

const RAIL_TABS: Array<{ id: RailTab; label: string }> = [
  { id: 'data', label: 'Data' },
  { id: 'areas', label: 'Areas' },
  { id: 'discussion', label: 'Discussion' },
];

const RailTabs: React.FC<{ tab: RailTab; areaCount: number; onChange: (tab: RailTab) => void }> = ({ tab, areaCount, onChange }) => (
  <div className="mesoscale-segments mesoscale-rail__tabs" role="group" aria-label="Workspace sections">
    {RAIL_TABS.map(item => (
      <button key={item.id} type="button" className="mesoscale-segment" aria-pressed={tab === item.id} onClick={() => onChange(item.id)}>
        {item.label}{item.id === 'areas' && areaCount > 0 ? ` (${areaCount})` : ''}
      </button>
    ))}
  </div>
);

interface DataTabProps {
  selection: MesoscaleSelection;
  catalog: MesoscaleCatalog;
  frame: Frame;
  parameters: MesoscaleCatalogParameter[];
  ageMinutes: number | null;
  stale: boolean;
}

interface RailProps extends DataTabProps {
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
  areas: MesoscaleAreasController;
}

const DataTab: React.FC<DataTabProps> = ({ selection, catalog, frame, parameters, ageMinutes, stale }) => (
  <>
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
  </>
);

const DataRail: React.FC<RailProps> = ({ tab, onTabChange, areas, ...data }) => (
  <div className="mesoscale-rail__scroll">
    <RailTabs tab={tab} areaCount={areas.areas.length} onChange={onTabChange} />
    {tab === 'data' ? <DataTab {...data} /> : null}
    {tab === 'areas' ? <AreasPanel areas={areas} /> : null}
    {tab === 'discussion' ? <DiscussionPanel /> : null}
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
  const [tab, setTab] = useState<RailTab>('data');
  const areas = useMesoscaleAreas();
  const { selectedId } = areas;
  // Picking an area on the map brings up its editor.
  useEffect(() => {
    if (!selectedId) return;
    setTab('areas');
    setRailOpen(true);
  }, [selectedId]);
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
        <DataRail tab={tab} onTabChange={setTab} areas={areas} selection={selection} catalog={catalog} frame={frame} parameters={parameters} ageMinutes={frames.ageMinutes} stale={frames.stale} />
      </aside>
      <div className="mesoscale-stage">
        <MesoscaleMap layers={layerSpecs} domainBounds={catalog.domain.bounds}>
          {(map) => (
            <>
              <MesoscaleAreaLayer map={map} areas={areas.areas} selectedId={areas.selectedId} tool={areas.tool} onDrawn={areas.addPolygon} onModified={areas.setGeometry} onSelect={areas.select} activeVertex={areas.activeVertex} />
              <AreaToolbar map={map} areas={areas} />
            </>
          )}
        </MesoscaleMap>
        <AreaLegend areas={areas.areas} />
        <RailToggle open={railOpen} onToggle={() => setRailOpen(open => !open)} />
        <MesoscaleLegend parameters={legendParameters} />
        <div className="mesoscale-unofficial"><UnofficialBadge /></div>
      </div>
    </div>
  );
};

/** Looks up the selected model's latest cycle. Remounting it (via its key) re-runs the lookup. */
const LatestResolver: React.FC<{ selection: MesoscaleSelection; onRetry: () => void; retryKey: number }> = ({ selection, onRetry, retryKey }) => {
  const latest = useMesoscaleLatest(selection.modelId);
  const cycleTime = 'data' in latest.result ? latest.result.data.cycleTime : null;

  if (!cycleTime) {
    return <StateMessage result={latest.result} subject={`the latest ${selection.modelId.toUpperCase()} run`} onRetry={onRetry} />;
  }
  return <LoadedWorkspace key={`${selection.modelId}-${retryKey}`} selection={selection} cycleTime={cycleTime} onRetry={onRetry} />;
};

/** Holds the selection and the retry counter; each retry remounts the lookup so it reloads. */
export const MesoscaleWorkspace: React.FC = () => {
  const selection = useMesoscaleSelection();
  const [retryKey, setRetryKey] = useState(0);
  return (
    <LatestResolver
      key={`${selection.modelId}-${retryKey}`}
      selection={selection}
      retryKey={retryKey}
      onRetry={() => setRetryKey(key => key + 1)}
    />
  );
};
