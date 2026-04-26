import React from 'react';
import ForecastMap, { ForecastMapHandle } from '../Map/ForecastMap';
import { TabbedIntegratedToolbar } from '../IntegratedToolbar/IntegratedToolbar';
import { TooltipProvider } from '../ui/tooltip';
import type { ForecastWorkspaceController } from './useForecastWorkspaceController';

export interface ForecastWorkspaceLayoutProps {
  controller: ForecastWorkspaceController;
  mapRef: React.RefObject<ForecastMapHandle | null>;
}

/** ForecastTabbedToolbarLayout renders the Forecast map and the tabbed integrated toolbar. */
export const ForecastTabbedToolbarLayout: React.FC<ForecastWorkspaceLayoutProps> = ({ controller, mapRef }) => (
  <TooltipProvider>
    <div className="forecast-workspace-layout flex h-full min-h-0 flex-col bg-gradient-to-b from-background via-background to-muted/10">
      <div className="forecast-workspace-layout__map relative min-h-0 flex-1">
        <ForecastMap ref={mapRef} />
      </div>
      <TabbedIntegratedToolbar controller={controller} />
    </div>
  </TooltipProvider>
);

export default ForecastTabbedToolbarLayout;
