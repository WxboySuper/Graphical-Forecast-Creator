import React from 'react';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import OutlookTrimPopover from './OutlookTrimPopover';

interface OutlookTrimToolbarSectionProps {
  controller: ForecastWorkspaceController;
}

/** Renders the optional land-trimming controls in the layers tab. */
const OutlookTrimToolbarSection: React.FC<OutlookTrimToolbarSectionProps> = ({ controller }) => (
  <section className="tabbed-integrated-toolbar__section tabbed-integrated-toolbar__section--trim flex h-full w-[132px] shrink-0 items-center gap-2 border-r border-border/70 pr-2">
    <div className="flex w-[74px] shrink-0 flex-col justify-center">
      <span className="tabbed-integrated-toolbar__section-label text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80 leading-tight">
        Trim to land
      </span>
      <span className="tabbed-integrated-toolbar__section-hint mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
        Optional
      </span>
    </div>
    <div className="tabbed-integrated-toolbar__section-content flex min-h-0 min-w-0 flex-1 items-center">
      <OutlookTrimPopover controller={controller} />
    </div>
  </section>
);

export default OutlookTrimToolbarSection;
