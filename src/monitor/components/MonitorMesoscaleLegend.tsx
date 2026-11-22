import React, { useState } from 'react';
import type { MesoscaleCatalogParameter } from '../../mesoscale';
import { MesoscaleLegend } from '../../components/Mesoscale/MesoscaleLegend';

export const MonitorMesoscaleLegend: React.FC<{ parameters: MesoscaleCatalogParameter[] }> = ({ parameters }) => {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="monitor-mesoscale__legend">
      <button type="button" className="monitor-mesoscale__legend-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Hide legend' : 'Show legend'}
      </button>
      {expanded ? <MesoscaleLegend parameters={parameters} /> : null}
    </div>
  );
};
