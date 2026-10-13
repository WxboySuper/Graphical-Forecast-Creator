import { useEffect, useMemo, useRef } from 'react';
import { fromLonLat } from 'ol/proj';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../nwsAlerts';
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
  selectedAlertId: string | null;
  onClearSelectedAlert: () => void;
}

/** Dismisses the selection after this many consecutive collections miss it. */
const MAX_CONSECUTIVE_ALERT_MISSES = 2;

const EMPTY_ID_SET: ReadonlySet<string> = new Set();

// TODO: share a canonical alert-id helper with alertSnapshotTokens in
// ../nwsAlerts.ts if the NWS id format ever changes.
/** Collects the canonical alert urls in a collection for presence checks. */
const buildAlertIdSet = (collection: NwsAlertFeatureCollection): Set<string> => {
  const ids = new Set<string>();
  collection.features.forEach((feature) => {
    const properties: Record<string, unknown> = feature.properties ?? {};
    const url = resolveNwsAlertDetailUrl(properties);
    if (url !== null) {
      ids.add(url);
    }
  });
  return ids;
};

/** Drops the selection after consecutive collections miss its alert id. */
const useSelectedAlertExpiry = (
  alertIds: ReadonlySet<string>,
  selectedAlertId: string | null,
  onClearSelectedAlert: () => void,
) => {
  const consecutiveMissesRef = useRef(0);
  const prevAlertIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (selectedAlertId === null) {
      consecutiveMissesRef.current = 0;
      prevAlertIdRef.current = null;
      return;
    }
    if (selectedAlertId !== prevAlertIdRef.current) {
      prevAlertIdRef.current = selectedAlertId;
      consecutiveMissesRef.current = 0;
    }
    if (!alertIds.has(selectedAlertId)) {
      consecutiveMissesRef.current += 1;
      if (consecutiveMissesRef.current >= MAX_CONSECUTIVE_ALERT_MISSES) {
        consecutiveMissesRef.current = 0;
        onClearSelectedAlert();
      }
    } else {
      consecutiveMissesRef.current = 0;
    }
  }, [alertIds, selectedAlertId, onClearSelectedAlert]);
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
  selectedAlertId,
  onClearSelectedAlert,
}: UseMonitorMapOverlaySyncArgs) => {
  const alertIds = useMemo(
    () => (selectedAlertId === null ? EMPTY_ID_SET : buildAlertIdSet(alertsCollection)),
    [alertsCollection, selectedAlertId],
  );
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
  // only after consecutive collections miss the selected alert id. A single
  // miss is tolerated so one animation frame, category toggle, refresh, or
  // transient empty response without the alert does not yank the popup
  // (issue #1595), while a genuinely expired or cancelled alert is still
  // dismissed.
  useSelectedAlertExpiry(alertIds, selectedAlertId, onClearSelectedAlert);

  useEffect(() => {
    syncStormReportFeatures(refs.stormReportsSourceRef.current, stormReports);
  }, [stormReports, refs.stormReportsSourceRef]);
};
