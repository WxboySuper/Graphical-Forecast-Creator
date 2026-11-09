/**
 * Monitor map composition component.
 *
 * This file wires the monitor view, radar and alert layers, and map controls into the OpenLayers map. Hooks provide data; this component owns composition and rendering.
 */
import React, { Suspense, useMemo, useRef } from 'react';
import 'ol/ol.css';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import type { OutlookData } from '../../types/outlooks';
import type { MonitorMapView, MonitorOutlookLayerType } from '../types';
import type { MonitorMesoscaleDiscussionCollection } from '../referenceLayers';
import { flattenMonitorOutlookFeatures } from '../outlookLayers';
import type { WmsLayerConfig } from '../wms';
import type { MesoscaleLayerSpec, MesoscaleCatalogParameter } from '../../mesoscale';
import { useMonitorOlMap } from './useMonitorOlMap';

const MonitorMesoscaleLegend = React.lazy(() => import('./MonitorMesoscaleLegend').then((module) => ({ default: module.MonitorMesoscaleLegend })));

interface MonitorMapProps {
  mapView: MonitorMapView;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  outlookData?: OutlookData;
  outlookType: MonitorOutlookLayerType;
  stormReports: StormReport[];
  alertsCollection: NwsAlertFeatureCollection;
  alertsOpacity: number;
  mesoscaleDiscussions: MonitorMesoscaleDiscussionCollection;
  referenceAttributions: string[];
  mesoscaleLayers?: MesoscaleLayerSpec[];
  mesoscaleLegend?: MesoscaleCatalogParameter[];
}

/** Monitor workspace map shell hosting radar, satellite, outlook, and alert layers. */
const MonitorMap: React.FC<MonitorMapProps> = ({
  mapView,
  radarLayer,
  radarOpacity,
  satelliteLayer,
  satelliteOpacity,
  outlookData,
  outlookType,
  stormReports,
  alertsCollection,
  alertsOpacity,
  mesoscaleDiscussions,
  referenceAttributions,
  mesoscaleLayers = [],
  mesoscaleLegend = [],
}) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const serializedFeatures = useMemo(
    () => flattenMonitorOutlookFeatures(outlookData, outlookType),
    [outlookData, outlookType],
  );

  useMonitorOlMap({
    mapView,
    radarLayer,
    radarOpacity,
    satelliteLayer,
    satelliteOpacity,
    serializedFeatures,
    stormReports,
    alertsCollection,
    alertsOpacity,
    mesoscaleDiscussions,
    mesoscaleLayers,
    mapElementRef,
  });

  return (
    <div className="monitor-map" aria-label="Monitor map" translate="no">
      <div ref={mapElementRef} className="monitor-map__viewport" />
      <div className="monitor-map__badge">Read-only monitor</div>
      {referenceAttributions.length > 0 ? (
        <div className="monitor-map__attribution" aria-label="Reference layer attribution">
          {referenceAttributions.join(' · ')}
        </div>
      ) : null}
      {mesoscaleLegend.length > 0 ? <Suspense fallback={null}><MonitorMesoscaleLegend parameters={mesoscaleLegend} /></Suspense> : null}
    </div>
  );
};

export default MonitorMap;
