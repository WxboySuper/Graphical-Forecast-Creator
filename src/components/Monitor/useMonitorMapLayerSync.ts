import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../../monitor/nwsAlerts';
import type { MonitorMapView } from '../../monitor/types';
import type { WmsLayerConfig } from '../../monitor/wms';
import type { SerializedMonitorOutlookFeature } from './monitorMapFeatureSync';
import type { useMonitorMapRefs } from './monitorMapRefs';
import { useMonitorMapOverlaySync } from './useMonitorMapOverlaySync';
import { useMonitorMapWmsSync } from './useMonitorMapWmsSync';

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

export const useMonitorMapLayerSync = (args: UseMonitorMapLayerSyncArgs) => {
  useMonitorMapWmsSync(args);
  useMonitorMapOverlaySync(args);
};
