/**
 * Severe workspace shell: one place for the Severe forecast's Map, Discussion,
 * and Review surfaces. A segmented switcher moves between surfaces, and a layout
 * choice decides whether Discussion opens full width or beside the map. Map,
 * discussion, and review content arrive as props; this module owns presentation
 * and focus handling only.
 */
import React, { useRef } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { ClipboardCheck, FileText, Map as MapIcon, PanelRight, RectangleHorizontal, type LucideIcon } from 'lucide-react';
import type { ForecastMapHandle } from '../Map/ForecastMap';
import { useHiddenMapGuards } from './useHiddenMapGuards';
import type { WorkspaceSurface } from './useWorkspaceSurface';
import {
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  useDiscussionLayoutChoice,
  useResizableDiscussionPanel,
  type DiscussionLayout,
} from './useSevereDiscussionLayout';
import './SevereWorkspaceShell.css';

const SURFACES: ReadonlyArray<{ id: WorkspaceSurface; label: string; icon: LucideIcon }> = [
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'discussion', label: 'Discussion', icon: FileText },
  { id: 'review', label: 'Review / Export', icon: ClipboardCheck },
];

const LAYOUTS: ReadonlyArray<{ id: DiscussionLayout; label: string; icon: LucideIcon }> = [
  { id: 'tabs', label: 'Full width', icon: RectangleHorizontal },
  { id: 'panel', label: 'Side panel', icon: PanelRight },
];

/** Moves focus and selection between surface tabs with the arrow, Home, and End keys. */
const handleTabKeys = (event: KeyboardEvent<HTMLDivElement>): void => {
  if (!(event.target instanceof HTMLElement) || !event.target.matches('[role="tab"]')) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const current = Math.max(0, tabs.findIndex((tab) => tab === document.activeElement));
  const nextIndexByKey: Record<string, number> = {
    ArrowRight: (current + 1) % tabs.length,
    ArrowLeft: (current - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  };
  const next = nextIndexByKey[event.key];
  if (next === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  tabs[next]?.focus();
  tabs[next]?.click();
};

const SurfaceTabs: React.FC<{ surface: WorkspaceSurface; onChange: (next: WorkspaceSurface) => void }> = ({
  surface,
  onChange,
}) => (
  <div className="severe-workspace__tabs" role="tablist" aria-label="Severe forecast workspace" onKeyDown={handleTabKeys}>
    {SURFACES.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        type="button"
        role="tab"
        className="severe-workspace__tab"
        tabIndex={surface === id ? 0 : -1}
        aria-selected={surface === id}
        onClick={() => onChange(id)}
      >
        <Icon className="severe-workspace__tabIcon" aria-hidden="true" />
        <span>{label}</span>
      </button>
    ))}
  </div>
);

const LayoutChoice: React.FC<{
  layout: DiscussionLayout;
  locked: boolean;
  onChange: (next: DiscussionLayout) => void;
}> = ({ layout, locked, onChange }) => (
  <div className="severe-workspace__layout" role="group" aria-label="Discussion layout">
    <span className="severe-workspace__layoutLabel" aria-hidden="true">Discussion opens</span>
    <div className="severe-workspace__segments">
      {LAYOUTS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="severe-workspace__segment"
          aria-pressed={layout === id}
          disabled={locked}
          title={locked ? 'Set by the page link' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon className="severe-workspace__tabIcon" aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  </div>
);

/** The resizable side panel and its splitter. */
const DiscussionSidePanel: React.FC<{
  panel: ReturnType<typeof useResizableDiscussionPanel>;
  children: ReactNode;
}> = ({ panel, children }) => (
  <>
    <div
      className="severe-workspace__splitter"
      role="separator"
      aria-label="Resize discussion panel"
      aria-orientation="vertical"
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuemax={PANEL_MAX_WIDTH}
      aria-valuenow={panel.width}
      tabIndex={0}
      onPointerDown={panel.startResize}
      onPointerUp={panel.stopResize}
      onPointerCancel={panel.stopResize}
      onLostPointerCapture={panel.stopResize}
      onKeyDown={panel.handleKeyDown}
    />
    <aside
      className="severe-workspace__discussion"
      style={{ width: panel.width, flexBasis: panel.width }}
      aria-label="Forecast discussion"
    >
      {children}
    </aside>
  </>
);

export interface SevereWorkspaceShellProps {
  surface: WorkspaceSurface;
  onSurfaceChange: (next: WorkspaceSurface) => void;
  mapRef: RefObject<ForecastMapHandle | null>;
  map: ReactNode;
  discussion: ReactNode;
  review: ReactNode;
}

/** Decides how the active surface and layout share the screen. */
const resolvePresentation = (surface: WorkspaceSurface, layout: DiscussionLayout) => {
  const panelOpen = layout === 'panel' && surface === 'discussion';
  const fullDiscussion = surface === 'discussion' && !panelOpen;
  return { panelOpen, fullDiscussion, mapHidden: surface === 'review' || fullDiscussion };
};

/** Renders the Severe workspace's surface switcher and the active surface. */
export const SevereWorkspaceShell: React.FC<SevereWorkspaceShellProps> = ({
  surface,
  onSurfaceChange,
  mapRef,
  map,
  discussion,
  review,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useDiscussionLayoutChoice();
  const panel = useResizableDiscussionPanel();
  const { panelOpen, fullDiscussion, mapHidden } = resolvePresentation(surface, layout.effective);
  useHiddenMapGuards({
    rootRef,
    mapRef,
    mapSelector: '.severe-workspace__map',
    returnSelector: '[role="tab"][aria-selected="true"]',
    hidden: mapHidden,
    layoutKey: `${panelOpen}-${panel.resizing ? 'resizing' : panel.width}`,
  });

  return (
    <div
      ref={rootRef}
      className={`severe-workspace severe-workspace--${layout.effective}`}
      data-surface={surface}
      data-testid="severe-workspace"
    >
      <div className="severe-workspace__bar">
        <SurfaceTabs surface={surface} onChange={onSurfaceChange} />
        {layout.isCompact ? null : (
          <LayoutChoice layout={layout.preferred} locked={layout.isForced} onChange={layout.setLayout} />
        )}
      </div>
      <div className="severe-workspace__content">
        <div
          className={`severe-workspace__map${mapHidden ? ' is-offscreen' : ''}`}
          aria-hidden={mapHidden}
          inert={mapHidden ? true : undefined}
          data-testid="severe-workspace-map"
        >
          {map}
        </div>
        {panelOpen ? <DiscussionSidePanel panel={panel}>{discussion}</DiscussionSidePanel> : null}
        {fullDiscussion ? (
          <section className="severe-workspace__discussion severe-workspace__discussion--full" role="tabpanel" aria-label="Forecast discussion">
            {discussion}
          </section>
        ) : null}
        {surface === 'review' ? (
          <section className="severe-workspace__review" role="tabpanel" aria-label="Review and export">
            {review}
          </section>
        ) : null}
      </div>
    </div>
  );
};
