/**
 * Mesoscale workspace: the map, the rail (data, areas, discussion), and the legend. Model data
 * (latest cycle and catalog) loads alongside; loading, stale, partial, and failed data are always
 * shown explicitly and an old cycle is never presented as current. Drawing areas and writing the
 * discussion never depend on the model data, so they keep working when it is down.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { MesoscaleCatalogParameter, MesoscaleLayerSpec } from '../../mesoscale';
import UnofficialBadge from '../Map/UnofficialBadge';
import { MesoscaleLegend } from './MesoscaleLegend';
import { MesoscaleMap } from './MesoscaleMap';
import { WorkspaceRail, type RailTab } from './WorkspaceRail';
import { AreaLegend } from './areas/AreaLegend';
import { AreaToolbar } from './areas/AreaToolbar';
import { MesoscaleAreaLayer } from './areas/MesoscaleAreaLayer';
import { useMesoscaleAreas } from './areas/useMesoscaleAreas';
import { useMesoscaleSelection, type MesoscaleSelection } from './useMesoscaleSelection';
import { useWorkspaceData, type WorkspaceData } from './useWorkspaceData';
import './Mesoscale.css';

/** Maps the active layer stack onto the frame's parameters, dropping fields the frame lacks. */
const buildLayerSpecs = (parameters: MesoscaleCatalogParameter[], selection: MesoscaleSelection): MesoscaleLayerSpec[] => {
  const byId = new Map(parameters.map(parameter => [parameter.id, parameter]));
  return selection.activeLayers.flatMap(layer => {
    const parameter = byId.get(layer.id);
    return parameter ? [{ id: layer.id, parameter, opacity: layer.opacity }] : [];
  });
};

/** Tells the forecaster, on the map, that model layers are missing but drawing still works. */
const MapDataNotice: React.FC<{ data: WorkspaceData }> = ({ data }) => {
  if (data.kind === 'ready' || data.result.state === 'loading') return null;
  return (
    <p className="mesoscale-map-notice" role="status">
      Model data is not available right now. You can still draw areas and write your discussion.
    </p>
  );
};

const RailToggle: React.FC<{ open: boolean; onToggle: () => void }> = ({ open, onToggle }) => (
  <button type="button" className="mesoscale-rail-toggle" aria-expanded={open} aria-controls="mesoscale-rail" onClick={onToggle}>
    {open ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
    <span>{open ? 'Hide data' : 'Data'}</span>
  </button>
);

const WorkspaceBody: React.FC<{ selection: MesoscaleSelection; onRetry: () => void }> = ({ selection, onRetry }) => {
  const data = useWorkspaceData(selection);
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
  const parameters = data.kind === 'ready' ? data.parameters : null;
  const layerSpecs = useMemo(() => (parameters ? buildLayerSpecs(parameters, selection) : []), [parameters, selection]);
  const legendParameters = useMemo(() => [...layerSpecs].reverse().map(spec => spec.parameter), [layerSpecs]);

  return (
    <div className={`mesoscale-workspace${railOpen ? '' : ' is-rail-closed'}`} data-testid="mesoscale-workspace">
      <aside id="mesoscale-rail" className="mesoscale-rail" aria-label="Model data" hidden={!railOpen}>
        <WorkspaceRail tab={tab} onTabChange={setTab} areas={areas} selection={selection} data={data} onRetry={onRetry} />
      </aside>
      <div className="mesoscale-stage">
        <MesoscaleMap layers={layerSpecs} domainBounds={data.kind === 'ready' ? data.catalog.domain.bounds : undefined}>
          {(map) => (
            <>
              <MesoscaleAreaLayer map={map} areas={areas.areas} selectedId={areas.selectedId} tool={areas.tool} onDrawn={areas.addPolygon} onModified={areas.setGeometry} onSelect={areas.select} />
              <AreaToolbar map={map} areas={areas} />
            </>
          )}
        </MesoscaleMap>
        <MapDataNotice data={data} />
        <AreaLegend areas={areas.areas} />
        <RailToggle open={railOpen} onToggle={() => setRailOpen(open => !open)} />
        <MesoscaleLegend parameters={legendParameters} />
        <div className="mesoscale-unofficial"><UnofficialBadge /></div>
      </div>
    </div>
  );
};

/** Holds the selection and the retry counter; each retry remounts the body so the lookups reload. */
export const MesoscaleWorkspace: React.FC = () => {
  const selection = useMesoscaleSelection();
  const [retryKey, setRetryKey] = useState(0);
  return <WorkspaceBody key={retryKey} selection={selection} onRetry={() => setRetryKey(key => key + 1)} />;
};
