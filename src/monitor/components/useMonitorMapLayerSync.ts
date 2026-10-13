import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import type { MonitorMapView } from '../types';
import type { MonitorMesoscaleDiscussionCollection } from '../referenceLayers';
import type { WmsLayerConfig } from '../wms';
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
  mesoscaleDiscussions: MonitorMesoscaleDiscussionCollection;
  refs: MonitorMapRefs;
  /** Canonical detail URL ('' for URL-less selections, exempt from expiry), or null for no selection. */
  selectedAlertDetailUrl: string | null;
  onClearSelectedAlert: () => void;
}

/** Coordinates WMS and vector overlay synchronization for the monitor map. */
export const useMonitorMapLayerSync = (args: UseMonitorMapLayerSyncArgs) => {
  useMonitorMapWmsSync({
    radarLayer: args.radarLayer,
    radarOpacity: args.radarOpacity,
    satelliteLayer: args.satelliteLayer,
    satelliteOpacity: args.satelliteOpacity,
    refs: args.refs,
  });
  useMonitorMapOverlaySync({
    mapView: args.mapView,
    darkMode: args.darkMode,
    serializedFeatures: args.serializedFeatures,
    stormReports: args.stormReports,
    alertsCollection: args.alertsCollection,
    mesoscaleDiscussions: args.mesoscaleDiscussions,
    alertsOpacity: args.alertsOpacity,
    refs: args.refs,
    selectedAlertDetailUrl: args.selectedAlertDetailUrl,
    onClearSelectedAlert: args.onClearSelectedAlert,
  });
};
