import { useEffect } from 'react';
import { fromLonLat } from 'ol/proj';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../../monitor/nwsAlerts';
import type { MonitorMapView } from '../../monitor/types';
import type { WmsLayerConfig } from '../../monitor/wms';
import {
  applyWmsLayer,
  buildWmsParams,
  createStateOutlineStyle,
} from './monitorMapLayerUtils';
import {
  syncAlertFeatures,
  syncOutlookFeatures,
  syncStormReportFeatures,
  type SerializedMonitorOutlookFeature,
} from './monitorMapFeatureSync';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

interface UseMonitorMapLayerSyncArgs {
  mapView: MonitorMapView;
  darkMode: boolean;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  serializedFeatures: SerializedMonitorOutlookFeature[];
  stormReports: StormReport[];
  alertsCollection: NwsAlertFeatureCollection;
  alertsOpacity: number;
  refs: MonitorMapRefs;
  onClearSelectedAlert: () => void;
}

export const useMonitorMapLayerSync = ({
  mapView,
  darkMode,
  radarLayer,
  radarOpacity,
  satelliteLayer,
  satelliteOpacity,
  serializedFeatures,
  stormReports,
  alertsCollection,
  alertsOpacity,
  refs,
  onClearSelectedAlert,
}: UseMonitorMapLayerSyncArgs) => {
  useEffect(() => {
    const style = createStateOutlineStyle(darkMode);
    refs.stateOutlineSourceRef.current.getFeatures().forEach((feature) => feature.setStyle(style));
  }, [darkMode]);

  useEffect(() => {
    const map = refs.mapRef.current;
    if (!map) {
      return;
    }

    refs.applyingExternalViewRef.current = true;
    const view = map.getView();
    view.setCenter(fromLonLat([mapView.center[1], mapView.center[0]]));
    view.setZoom(mapView.zoom);
    window.setTimeout(() => {
      refs.applyingExternalViewRef.current = false;
    }, 0);
  }, [mapView.center, mapView.zoom]);

  useEffect(() => {
    if (refs.radarLayerRef.current) {
      applyWmsLayer(refs.radarLayerRef.current, radarLayer, radarOpacity, refs.radarLayerKeyRef);
    }
  }, [radarLayer, radarOpacity]);

  useEffect(() => {
    const source = refs.radarLayerRef.current?.getSource();
    if (source && radarLayer) {
      source.updateParams(buildWmsParams(radarLayer));
    }
  }, [radarLayer?.latestTime]);

  useEffect(() => {
    if (refs.satelliteLayerRef.current) {
      applyWmsLayer(refs.satelliteLayerRef.current, satelliteLayer, satelliteOpacity, refs.satelliteLayerKeyRef);
    }
  }, [satelliteLayer, satelliteOpacity]);

  useEffect(() => {
    const source = refs.satelliteLayerRef.current?.getSource();
    if (source && satelliteLayer) {
      source.updateParams(buildWmsParams(satelliteLayer));
    }
  }, [satelliteLayer?.latestTime]);

  useEffect(() => {
    syncOutlookFeatures(refs.outlookSourceRef.current, serializedFeatures);
  }, [serializedFeatures]);

  useEffect(() => {
    refs.alertsLayerRef.current?.setOpacity(alertsOpacity);
  }, [alertsOpacity]);

  useEffect(() => {
    syncAlertFeatures(refs.alertsSourceRef.current, alertsCollection);
  }, [alertsCollection]);

  useEffect(() => {
    onClearSelectedAlert();
  }, [alertsCollection, onClearSelectedAlert]);

  useEffect(() => {
    syncStormReportFeatures(refs.stormReportsSourceRef.current, stormReports);
  }, [stormReports]);
};
