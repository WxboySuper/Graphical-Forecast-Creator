import { useEffect, useRef } from 'react';
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
  selectedAlertDetailUrl: string | null;
  onClearSelectedAlert: () => void;
}

/** Dismisses the selection after this many consecutive collections miss it. */
const MAX_CONSECUTIVE_ALERT_MISSES = 2;

/** Normalizes a candidate alert detail URL to its canonical compared form. */
export const normalizeAlertDetailUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Reads a canonical http(s) URL from a top-level GeoJSON feature id. */
const topLevelAlertUrl = (id: unknown): string | null => {
  if (typeof id !== 'string') {
    return null;
  }
  const trimmed = id.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
};

/** Checks a collection for a canonical alert url with an early exit. */
const hasAlertId = (collection: NwsAlertFeatureCollection, detailUrl: string): boolean => {
  const features = Array.isArray(collection.features) ? collection.features : [];
  return features.some((feature) => {
    if (!feature) {
      return false;
    }
    const properties: Record<string, unknown> = feature.properties ?? {};
    const url = resolveNwsAlertDetailUrl(properties) ?? topLevelAlertUrl(feature.id);
    return url === detailUrl;
  });
};

/** Drops the selection after consecutive collections miss its alert url. */
const useSelectedAlertExpiry = (
  alertsCollection: NwsAlertFeatureCollection,
  selectedAlertDetailUrl: string | null,
  onClearSelectedAlert: () => void,
) => {
  const consecutiveMissesRef = useRef(0);
  const prevAlertDetailUrlRef = useRef<string | null>(null);
  const clearSelectedAlertRef = useRef(onClearSelectedAlert);

  useEffect(() => {
    clearSelectedAlertRef.current = onClearSelectedAlert;
  }, [onClearSelectedAlert]);

  useEffect(() => {
    if (selectedAlertDetailUrl === null || selectedAlertDetailUrl === '') {
      consecutiveMissesRef.current = 0;
      prevAlertDetailUrlRef.current = selectedAlertDetailUrl;
      return;
    }
    if (selectedAlertDetailUrl !== prevAlertDetailUrlRef.current) {
      prevAlertDetailUrlRef.current = selectedAlertDetailUrl;
      consecutiveMissesRef.current = 0;
      return;
    }
    if (!hasAlertId(alertsCollection, selectedAlertDetailUrl)) {
      consecutiveMissesRef.current += 1;
      if (consecutiveMissesRef.current >= MAX_CONSECUTIVE_ALERT_MISSES) {
        consecutiveMissesRef.current = 0;
        prevAlertDetailUrlRef.current = null;
        clearSelectedAlertRef.current();
      }
    } else {
      consecutiveMissesRef.current = 0;
    }
  }, [alertsCollection, selectedAlertDetailUrl]);
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
  selectedAlertDetailUrl,
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

  // Dismissal paths (popup close button, map click, unmount, new selection) live
  // in useMonitorOlMap/useMonitorMapBootstrap; here the selection is dropped
  // only after consecutive collections miss the selected alert url. A single
  // miss is tolerated so one animation frame, category toggle, or refresh
  // without the alert does not yank the popup (issue #1595), while a
  // genuinely expired or cancelled alert is still dismissed. Selections
  // without a stable identity ('') are exempt from expiry and dismiss
  // manually, since no collection can confirm or refute them.
  useSelectedAlertExpiry(alertsCollection, selectedAlertDetailUrl, onClearSelectedAlert);

  useEffect(() => {
    syncStormReportFeatures(refs.stormReportsSourceRef.current, stormReports);
  }, [stormReports, refs.stormReportsSourceRef]);
};
