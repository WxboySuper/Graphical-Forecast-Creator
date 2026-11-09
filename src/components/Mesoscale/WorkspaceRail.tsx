/**
 * The workspace rail: tabs for the model data, the drawn areas, and the discussion. The Areas and
 * Discussion tabs never depend on model data, so they work while it loads or is unavailable.
 */
import React from 'react';
import { formatDuration, ModelSwitcher, SourcePanel } from './SourcePanel';
import { isMesoscaleDemoData } from '../../mesoscale/fixtures/client';
import { LayerPanel } from './LayerPanel';
import { InlineStateMessage } from './StateMessage';
import { AreasPanel } from './areas/AreasPanel';
import { DiscussionPanel } from './areas/DiscussionPanel';
import type { MesoscaleAreasController } from './areas/useMesoscaleAreas';
import type { MesoscaleSelection } from './useMesoscaleSelection';
import type { Frame, ReadyWorkspaceData, UnavailableWorkspaceData, WorkspaceData } from './useWorkspaceData';

export type RailTab = 'data' | 'areas' | 'discussion';

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

const ReadyDataTab: React.FC<{ selection: MesoscaleSelection; data: ReadyWorkspaceData }> = ({ selection, data }) => (
  <>
    <FrameNotices frame={data.frame} stale={data.stale} ageMinutes={data.ageMinutes} />
    <SourcePanel
      modelId={selection.modelId}
      hour={data.frame.forecastHour}
      catalog={data.catalog}
      frame={data.frame}
      ageMinutes={data.ageMinutes}
      stale={data.stale}
      onSelectModel={selection.selectModel}
      onSelectHour={selection.selectHour}
    />
    <LayerPanel parameters={data.parameters} layers={selection.activeLayers} onChange={selection.setLayers} />
  </>
);

/** While model data is unavailable the model can still be switched, and drawing is explained as available. */
const UnavailableDataTab: React.FC<{ selection: MesoscaleSelection; data: UnavailableWorkspaceData; onRetry: () => void }> = ({ selection, data, onRetry }) => (
  <section className="mesoscale-section" aria-label="Model data">
    <h2 className="mesoscale-section__title">Model data</h2>
    <ModelSwitcher modelId={selection.modelId} onSelect={selection.selectModel} />
    <InlineStateMessage result={data.result} subject={data.subject} onRetry={onRetry} />
    <p className="mesoscale-notice" role="note">You can still draw areas and write your discussion. They save on this device.</p>
  </section>
);

interface RailProps {
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
  areas: MesoscaleAreasController;
  selection: MesoscaleSelection;
  data: WorkspaceData;
  onRetry: () => void;
}

export const WorkspaceRail: React.FC<RailProps> = ({ tab, onTabChange, areas, selection, data, onRetry }) => (
  <div className="mesoscale-rail__scroll">
    <RailTabs tab={tab} areaCount={areas.areas.length} onChange={onTabChange} />
    {tab === 'data' && data.kind === 'ready' ? <ReadyDataTab selection={selection} data={data} /> : null}
    {tab === 'data' && data.kind === 'unavailable' ? <UnavailableDataTab selection={selection} data={data} onRetry={onRetry} /> : null}
    {tab === 'areas' ? <AreasPanel areas={areas} /> : null}
    {tab === 'discussion' ? <DiscussionPanel /> : null}
  </div>
);
