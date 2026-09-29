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
  selectedAlert: NwsAlertDetails | null;
  onClearSelectedAlert: () => void;
}

/** Returns true when the selected alert is still present in the active collection. */
export const isSelectedAlertInCollection = (
  alertsCollection: NwsAlertFeatureCollection,
  selectedAlert: NwsAlertDetails | null,
): boolean => {
  if (!selectedAlert) {
    return true;
  }

  if (selectedAlert.detailUrl) {
    return alertsCollection.features.some((feature) => {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      if (resolveNwsAlertDetailUrl(properties) === selectedAlert.detailUrl) {
        return true;
      }
      const featureId = typeof feature.id === 'string' ? feature.id : null;
      return featureId !== null && featureId === selectedAlert.detailUrl;
    });
  }

  const normalize = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return alertsCollection.features.some((feature) => {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    return (
      (normalize(properties.event) ?? 'Weather alert') === selectedAlert.event &&
      normalize(properties.headline) === selectedAlert.headline &&
      normalize(properties.areaDesc) === selectedAlert.areaDesc &&
      (normalize(properties.effective) ?? normalize(properties.onset)) === selectedAlert.effective &&
      (normalize(properties.expires) ?? normalize(properties.ends)) === selectedAlert.expires
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
  selectedAlert,
  onClearSelectedAlert,
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
    if (!isSelectedAlertInCollection(alertsCollection, selectedAlert)) {
      onClearSelectedAlert();
    }
  }, [alertsCollection, selectedAlert, onClearSelectedAlert]);

  useEffect(() => {
    syncStormReportFeatures(refs.stormReportsSourceRef.current, stormReports);
  }, [stormReports, refs.stormReportsSourceRef]);
};
