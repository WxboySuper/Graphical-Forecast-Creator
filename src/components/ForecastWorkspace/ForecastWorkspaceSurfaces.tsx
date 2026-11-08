/**
 * Forecast workspace surfaces: chooses how a workspace presents its map,
 * discussion, and review content. Severe uses the full shell with its surface
 * switcher; Custom keeps its map in place and shows Discussion only when a
 * legacy link asks for it. Map and review content arrive as props.
 */
import React, { useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Button } from '../ui/button';
import { lazyWithReload } from '../../routing/lazyWithReload';
import type { ForecastMapHandle } from '../Map/ForecastMap';
import type { ForecastWorkspaceId } from '../../config/forecastWorkspaces';
import { SevereWorkspaceShell } from './SevereWorkspaceShell';
import { useHiddenMapGuards } from './useHiddenMapGuards';
import type { WorkspaceSurface } from './useWorkspaceSurface';
import './ForecastWorkspaceSurfaces.css';

const EmbeddedDiscussionPage = lazyWithReload('discussion', () =>
  import('../../pages/DiscussionPage').then((module) => ({ default: module.DiscussionPage })),
);

const DiscussionSurface: React.FC<{ revision: number }> = ({ revision }) => (
  <React.Suspense fallback={<div role="status">Loading discussion…</div>}>
    <EmbeddedDiscussionPage embedded resetToken={revision} />
  </React.Suspense>
);

/** Custom keeps its map mounted but hidden while a legacy Discussion link is open. */
const CustomWorkspaceSurfaces: React.FC<{
  surface: WorkspaceSurface;
  onSurfaceChange: (next: WorkspaceSurface) => void;
  mapRef: RefObject<ForecastMapHandle | null>;
  map: ReactNode;
  discussionRevision: number;
}> = ({ surface, onSurfaceChange, mapRef, map, discussionRevision }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const discussionOpen = surface === 'discussion';
  useHiddenMapGuards({
    rootRef,
    mapRef,
    mapSelector: '.custom-workspace__map',
    returnSelector: '[data-workspace-return-map]',
    hidden: discussionOpen,
    layoutKey: 'custom',
  });

  return (
    <div ref={rootRef} className="custom-forecast-workspace">
      <div
        className={`custom-workspace__map${discussionOpen ? ' is-offscreen' : ''}`}
        aria-hidden={discussionOpen}
        inert={discussionOpen ? true : undefined}
      >
        {map}
      </div>
      {discussionOpen ? (
        <div className="custom-workspace-discussion">
          <div className="custom-workspace-discussion__navigation">
            <Button type="button" variant="outline" data-workspace-return-map onClick={() => onSurfaceChange('map')}>
              Return to Custom map
            </Button>
          </div>
          <DiscussionSurface revision={discussionRevision} />
        </div>
      ) : null}
    </div>
  );
};

export interface ForecastWorkspaceSurfacesProps {
  workspaceId: ForecastWorkspaceId;
  surface: WorkspaceSurface;
  onSurfaceChange: (next: WorkspaceSurface) => void;
  mapRef: RefObject<ForecastMapHandle | null>;
  map: ReactNode;
  review: ReactNode;
  discussionRevision: number;
}

/** Renders the surfaces for the active forecast workspace. */
export const ForecastWorkspaceSurfaces: React.FC<ForecastWorkspaceSurfacesProps> = ({
  workspaceId,
  surface,
  onSurfaceChange,
  mapRef,
  map,
  review,
  discussionRevision,
}) => (workspaceId === 'severe' ? (
  <SevereWorkspaceShell
    surface={surface}
    onSurfaceChange={onSurfaceChange}
    mapRef={mapRef}
    map={map}
    review={review}
    discussion={<DiscussionSurface revision={discussionRevision} />}
  />
) : (
  <CustomWorkspaceSurfaces
    surface={surface}
    onSurfaceChange={onSurfaceChange}
    mapRef={mapRef}
    map={map}
    discussionRevision={discussionRevision}
  />
));
