import { useEffect, useRef } from 'react';
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

/** Matches the selected alert against a collection by canonical detail URL. */
const containsAlertId = (collection: NwsAlertFeatureCollection, id: string): boolean =>
  collection.features.some((feature) => {
    if (feature.id === id) {
      return true;
    }
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    return resolveNwsAlertDetailUrl(properties) === id;
  });

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
  const selectedId = selectedAlert?.detailUrl ?? null;
  const consecutiveMissesRef = useRef(0);
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

  // Dismissal paths (popup close button, map click, unmount, new selection) live
  // in useMonitorOlMap/useMonitorMapBootstrap; here the selection is dropped
  // only after two consecutive collections miss the selected alert id. A
  // single miss is tolerated so one animation frame, category toggle, or
  // refresh without the alert does not yank the popup (issue #1595), while a
  // genuinely expired or cancelled alert is still dismissed.
  useEffect(() => {
    consecutiveMissesRef.current = 0;
  }, [selectedId]);

  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    if (containsAlertId(alertsCollection, selectedId)) {
      consecutiveMissesRef.current = 0;
      return;
    }
    consecutiveMissesRef.current += 1;
    if (consecutiveMissesRef.current >= 2) {
      consecutiveMissesRef.current = 0;
      onClearSelectedAlert();
    }
  }, [alertsCollection, selectedId, onClearSelectedAlert]);

  useEffect(() => {
    syncStormReportFeatures(refs.stormReportsSourceRef.current, stormReports);
  }, [stormReports, refs.stormReportsSourceRef]);
};
