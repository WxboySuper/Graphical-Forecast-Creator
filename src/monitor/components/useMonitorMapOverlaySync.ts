import { useEffect } from 'react';
import { fromLonLat } from 'ol/proj';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
import type { NwsAlertDetails } from '../nwsAlertDetails';
import { resolveNwsAlertDetailUrl } from '../nwsAlertDetails';
import type { MonitorMapView } from '../types';
import type { MonitorMesoscaleDiscussionCollection } from '../referenceLayers';
import { createStateOutlineStyle } from './monitorMapLayerUtils';
import {
  syncAlertFeatures,
  syncMesoscaleDiscussionFeatures,
  syncOutlookFeatures,
  syncStormReportFeatures,
  type SerializedMonitorOutlookFeature,
} from './monitorMapFeatureSync';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

interface UseMonitorMapOverlaySyncArgs {
  mapView: MonitorMapView;
  darkMode: boolean;
  serializedFeatures: SerializedMonitorOutlookFeature[];
  stormReports: StormReport[];
  alertsCollection: NwsAlertFeatureCollection;
  mesoscaleDiscussions: MonitorMesoscaleDiscussionCollection;
  alertsOpacity: number;
  refs: MonitorMapRefs;
  onClearSelectedAlert: () => void;
  selectedAlert?: NwsAlertDetails | null;
}

/** Checks whether the selected alert is still present in the incoming collection. */
const isSelectedAlertInCollection = (
  collection: NwsAlertFeatureCollection,
  selectedAlert: NwsAlertDetails | null | undefined,
): boolean => {
  if (!selectedAlert) {
    return true;
  }

  if (selectedAlert.detailUrl) {
    return collection.features.some((feature) => {
      if (feature.id != null && String(feature.id) === selectedAlert.detailUrl) {
        return true;
      }
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      if (
        properties.id != null &&
        typeof properties.id === 'string' &&
        properties.id === selectedAlert.detailUrl
      ) {
        return true;
      }
      return resolveNwsAlertDetailUrl(properties) === selectedAlert.detailUrl;
    });
  }

  return collection.features.some((feature) => {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    return (
      (typeof properties.event === 'string' ? properties.event : 'Weather alert') ===
        selectedAlert.event &&
      (typeof properties.headline === 'string' ? properties.headline : null) ===
        selectedAlert.headline &&
      (typeof properties.areaDesc === 'string' ? properties.areaDesc : null) ===
        selectedAlert.areaDesc
    );
  });
};

/** Synchronizes non-WMS monitor map overlays and external map view state. */
export const useMonitorMapOverlaySync = ({
  mapView,
  darkMode,
  serializedFeatures,
  stormReports,
  alertsCollection,
  mesoscaleDiscussions,
  alertsOpacity,
  refs,
  onClearSelectedAlert,
  selectedAlert,
}: UseMonitorMapOverlaySyncArgs) => {
  useEffect(() => {
    const style = createStateOutlineStyle(darkMode);
    refs.stateOutlineSourceRef.current.getFeatures().forEach((feature) => feature.setStyle(style));
  }, [darkMode, refs.stateOutlineSourceRef]);

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
  }, [mapView.center, mapView.zoom, refs.applyingExternalViewRef, refs.mapRef]);

  useEffect(() => {
    syncOutlookFeatures(refs.outlookSourceRef.current, serializedFeatures);
  }, [serializedFeatures, refs.outlookSourceRef]);

  useEffect(() => {
    refs.alertsLayerRef.current?.setOpacity(alertsOpacity);
  }, [alertsOpacity, refs.alertsLayerRef]);

  useEffect(() => {
    syncAlertFeatures(refs.alertsSourceRef.current, alertsCollection);
  }, [alertsCollection, refs.alertsSourceRef]);

  useEffect(() => {
    syncMesoscaleDiscussionFeatures(refs.mesoscaleDiscussionSourceRef.current, mesoscaleDiscussions);
    refs.mesoscaleDiscussionLayerRef.current?.setVisible(mesoscaleDiscussions.features.length > 0);
  }, [mesoscaleDiscussions, refs.mesoscaleDiscussionLayerRef, refs.mesoscaleDiscussionSourceRef]);

  useEffect(() => {
    if (!selectedAlert) {
      return;
    }
    if (isSelectedAlertInCollection(alertsCollection, selectedAlert)) {
      return;
    }
    onClearSelectedAlert();
  }, [alertsCollection, onClearSelectedAlert, selectedAlert]);

  useEffect(() => {
    syncStormReportFeatures(refs.stormReportsSourceRef.current, stormReports);
  }, [stormReports, refs.stormReportsSourceRef]);
};
