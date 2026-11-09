import React from 'react';
import type { MesoscaleCatalogParameter } from '../../mesoscale';
import { MesoscaleLegend } from '../../components/Mesoscale/MesoscaleLegend';

export const MonitorMesoscaleLegend: React.FC<{ parameters: MesoscaleCatalogParameter[] }> = ({ parameters }) => (
  <div className="monitor-mesoscale__legend"><MesoscaleLegend parameters={parameters} /></div>
);
