import { useCallback, useState, type RefObject } from 'react';
import { useSelector } from 'react-redux';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../../monitor/nwsAlerts';
import type { NwsAlertDetails } from '../../monitor/nwsAlertDetails';
import { hideOverlay } from '../Map/OpenLayersForecastMap';
import type { RootState } from '../../store';
import type { MonitorMapView } from '../../monitor/types';
import type { WmsLayerConfig } from '../../monitor/wms';
import type { SerializedMonitorOutlookFeature } from './monitorMapFeatureSync';
import { useMonitorMapBootstrap } from './useMonitorMapBootstrap';
import { useMonitorMapLayerSync } from './useMonitorMapLayerSync';
import { useMonitorMapRefs } from './monitorMapRefs';

interface UseMonitorOlMapArgs {
  mapView: MonitorMapView;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  serializedFeatures: SerializedMonitorOutlookFeature[];
  stormReports: StormReport[];
  alertsCollection: NwsAlertFeatureCollection;
  alertsOpacity: number;
  mapElementRef: RefObject<HTMLDivElement | null>;
}

export const useMonitorOlMap = (args: UseMonitorOlMapArgs) => {
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const [selectedAlert, setSelectedAlert] = useState<NwsAlertDetails | null>(null);
  const refs = useMonitorMapRefs();

  const clearSelectedAlert = useCallback(() => {
    if (refs.overlayRef.current) {
      hideOverlay(refs.overlayRef.current);
    }
    setSelectedAlert(null);
  }, [refs]);

  useMonitorMapBootstrap({
    mapView: args.mapView,
    darkMode,
    radarOpacity: args.radarOpacity,
    satelliteOpacity: args.satelliteOpacity,
    alertsOpacity: args.alertsOpacity,
    mapElementRef: args.mapElementRef,
    refs,
    onSelectAlert: setSelectedAlert,
  });

  useMonitorMapLayerSync({
    mapView: args.mapView,
    darkMode,
    radarLayer: args.radarLayer,
    radarOpacity: args.radarOpacity,
    satelliteLayer: args.satelliteLayer,
    satelliteOpacity: args.satelliteOpacity,
    serializedFeatures: args.serializedFeatures,
    stormReports: args.stormReports,
    alertsCollection: args.alertsCollection,
    alertsOpacity: args.alertsOpacity,
    refs,
    onClearSelectedAlert: clearSelectedAlert,
  });

  return {
    selectedAlert,
    handleCloseAlertPopup: clearSelectedAlert,
    popupElRef: refs.popupElRef,
  };
};
