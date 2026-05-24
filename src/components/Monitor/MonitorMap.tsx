import React, { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import 'ol/ol.css';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../../monitor/nwsAlerts';
import MonitorAlertPopup from './MonitorAlertPopup';
import type { OutlookData } from '../../types/outlooks';
import type { MonitorMapView, MonitorOutlookLayerType } from '../../monitor/types';
import { flattenMonitorOutlookFeatures } from '../../monitor/outlookLayers';
import type { WmsLayerConfig } from '../../monitor/wms';
import { useMonitorOlMap } from './useMonitorOlMap';

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
}

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
}) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const serializedFeatures = useMemo(
    () => flattenMonitorOutlookFeatures(outlookData, outlookType),
    [outlookData, outlookType],
  );

  const { selectedAlert, handleCloseAlertPopup, popupElRef } = useMonitorOlMap({
    mapView,
    radarLayer,
    radarOpacity,
    satelliteLayer,
    satelliteOpacity,
    serializedFeatures,
    stormReports,
    alertsCollection,
    alertsOpacity,
    mapElementRef,
  });

  return (
    <div className="monitor-map" aria-label="Monitor map">
      <div ref={mapElementRef} className="monitor-map__viewport" />
      {popupElRef.current &&
        createPortal(
          selectedAlert && (
            <MonitorAlertPopup details={selectedAlert} onClose={handleCloseAlertPopup} />
          ),
          popupElRef.current,
        )}
      <div className="monitor-map__badge">Read-only monitor</div>
    </div>
  );
};

export default MonitorMap;
