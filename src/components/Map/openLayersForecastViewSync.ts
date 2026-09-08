/**
 * File: src/components/Map/openLayersForecastViewSync.ts
 * Purpose: Synchronizes OpenLayers forecast-map view state with application selection and viewport state.
 */

import type OLMap from "ol/Map";
import { fromLonLat, toLonLat } from "ol/proj";
import type { MutableRefObject } from "react";
import { setMapView } from "../../store/forecastSlice";

export interface ForecastMapView {
  center: [number, number];
  zoom: number;
}

interface MoveEndOptions {
  map: OLMap;
  isApplyingExternalViewRef: MutableRefObject<boolean>;
  currentMapViewRef: MutableRefObject<ForecastMapView>;
  dispatch: (action: ReturnType<typeof setMapView>) => unknown;
}

/** Persists a user-driven OpenLayers view change when it differs from Redux state. */
export const syncMapViewFromOpenLayers = ({
  map,
  isApplyingExternalViewRef,
  currentMapViewRef,
  dispatch,
}: MoveEndOptions): void => {
  if (isApplyingExternalViewRef.current) return;

  const center = map.getView().getCenter();
  if (!center) return;

  const [lon, lat] = toLonLat(center);
  const nextCenter: [number, number] = [lat, lon];
  const nextZoom = map.getView().getZoom() || 4;
  const [stateLat, stateLon] = currentMapViewRef.current.center;
  const centerChanged =
    Math.abs(stateLat - nextCenter[0]) > 0.000001 ||
    Math.abs(stateLon - nextCenter[1]) > 0.000001;
  const zoomChanged = Math.abs(currentMapViewRef.current.zoom - nextZoom) > 0.000001;

  if (centerChanged || zoomChanged) {
    dispatch(setMapView({ center: nextCenter, zoom: nextZoom }));
  }
};

interface StateSyncOptions {
  map: OLMap;
  currentMapView: ForecastMapView;
  isApplyingExternalViewRef: MutableRefObject<boolean>;
}

/** Applies a Redux view change to OpenLayers while suppressing its matching move event. */
export const syncOpenLayersViewFromState = ({
  map,
  currentMapView,
  isApplyingExternalViewRef,
}: StateSyncOptions): void => {
  const view = map.getView();
  const targetCenter = fromLonLat([currentMapView.center[1], currentMapView.center[0]]);
  const currentCenter = view.getCenter();
  const centerChanged =
    !currentCenter ||
    Math.abs(currentCenter[0] - targetCenter[0]) > 0.01 ||
    Math.abs(currentCenter[1] - targetCenter[1]) > 0.01;
  const zoomChanged = Math.abs((view.getZoom() || 4) - currentMapView.zoom) > 0.000001;

  if (!centerChanged && !zoomChanged) return;

  isApplyingExternalViewRef.current = true;
  view.setCenter(targetCenter);
  view.setZoom(currentMapView.zoom);
  setTimeout(() => {
    isApplyingExternalViewRef.current = false;
  }, 0);
};
