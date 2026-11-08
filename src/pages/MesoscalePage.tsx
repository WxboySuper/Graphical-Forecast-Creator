/**
 * Mesoscale forecast workspace page: the route host for Forecast > Mesoscale. It
 * owns only the page frame and the "data source not configured" case; the model
 * data, map, and controls live in the Mesoscale workspace components.
 */
import React from 'react';
import { MesoscaleWorkspace } from '../components/Mesoscale/MesoscaleWorkspace';
import { getMesoscaleClientConfig } from '../config/mesoscale';
import '../components/Mesoscale/Mesoscale.css';

const NotConfigured: React.FC = () => (
  <div className="mesoscale-state" role="alert">
    <h1 className="mesoscale-state__title">Mesoscale data is not set up</h1>
    <p className="mesoscale-state__body">
      This build has no model data source. For local development, set VITE_MESOSCALE_FIXTURES=true
      (and VITE_MESOSCALE_DEMO=true for a full demo), or point VITE_MESOSCALE_WORKER_URL at the catalog Worker.
    </p>
  </div>
);

export const MesoscalePage: React.FC = () => (
  <div className="mesoscale-page" data-testid="mesoscale-page">
    {getMesoscaleClientConfig().enabled ? <MesoscaleWorkspace /> : <NotConfigured />}
  </div>
);

export default MesoscalePage;
