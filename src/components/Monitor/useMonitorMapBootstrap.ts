import { useEffect, type RefObject } from 'react';
import OLMap from 'ol/Map';
import View from 'ol/View';
import Overlay from 'ol/Overlay';
import LayerGroup from 'ol/layer/Group';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import TileWMS from 'ol/source/TileWMS';
import { fromLonLat, toLonLat } from 'ol/proj';
import { apply } from 'ol-mapbox-style';
import { buildNwsAlertStyle } from '../../monitor/nwsAlerts';
import { parseNwsAlertFromOlProperties } from '../../monitor/nwsAlertDetails';
import type { NwsAlertDetails } from '../../monitor/nwsAlertDetails';
import { hideOverlay } from '../Map/OpenLayersForecastMap';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { setMonitorMapView } from '../../store/monitorSlice';
import type { MonitorMapView } from '../../monitor/types';
import { getOpenFreeMapStyleSet } from '../../lib/openFreeMap';
import {
  ALERTS_LAYER_Z_INDEX,
  BASE_LAYER_Z_INDEX,
  createBaseSource,
  loadUsStateOutlines,
  OUTLOOK_LAYER_Z_INDEX,
  RADAR_LAYER_Z_INDEX,
  replaceLayerGroupLayers,
  SATELLITE_LAYER_Z_INDEX,
  STATE_OUTLINE_LAYER_Z_INDEX,
  STORM_REPORTS_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
} from './monitorMapLayerUtils';
import type { useMonitorMapRefs } from './monitorMapRefs';

type MonitorMapRefs = ReturnType<typeof useMonitorMapRefs>;

interface UseMonitorMapBootstrapArgs {
  mapView: MonitorMapView;
  darkMode: boolean;
  radarOpacity: number;
  satelliteOpacity: number;
  alertsOpacity: number;
  mapElementRef: RefObject<HTMLDivElement | null>;
  popupRef: RefObject<HTMLDivElement | null>;
  refs: MonitorMapRefs;
  onSelectAlert: (details: NwsAlertDetails | null) => void;
}

export const useMonitorMapBootstrap = ({
  mapView,
  darkMode,
  radarOpacity,
  satelliteOpacity,
  alertsOpacity,
  mapElementRef,
  popupRef,
  refs,
  onSelectAlert,
}: UseMonitorMapBootstrapArgs) => {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!mapElementRef.current) {
      return;
    }

    const alertsLayer = new VectorLayer({
      source: refs.alertsSourceRef.current,
      opacity: alertsOpacity,
      zIndex: ALERTS_LAYER_Z_INDEX,
      style: (feature) => buildNwsAlertStyle(String(feature.get('event') ?? '')),
    });
    const radarLayerInstance = new TileLayer<TileWMS>({
      visible: false,
      opacity: radarOpacity,
      zIndex: RADAR_LAYER_Z_INDEX,
    });
    const satelliteLayerInstance = new TileLayer<TileWMS>({
      visible: false,
      opacity: satelliteOpacity,
      zIndex: SATELLITE_LAYER_Z_INDEX,
    });
    const vectorReferenceGroup = new LayerGroup({
      visible: false,
      zIndex: TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
    });

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        new TileLayer({ source: createBaseSource(darkMode), zIndex: BASE_LAYER_Z_INDEX }),
        satelliteLayerInstance,
        radarLayerInstance,
        alertsLayer,
        new VectorLayer({ source: refs.outlookSourceRef.current, zIndex: OUTLOOK_LAYER_Z_INDEX }),
        new VectorLayer({ source: refs.stormReportsSourceRef.current, zIndex: STORM_REPORTS_LAYER_Z_INDEX }),
        new VectorLayer({ source: refs.stateOutlineSourceRef.current, zIndex: STATE_OUTLINE_LAYER_Z_INDEX }),
        vectorReferenceGroup,
      ],
      view: new View({
        center: fromLonLat([mapView.center[1], mapView.center[0]]),
        zoom: mapView.zoom,
        minZoom: 2,
        maxZoom: 14,
      }),
    });

    const handleMoveEnd = () => {
      if (refs.applyingExternalViewRef.current) {
        return;
      }

      const center = map.getView().getCenter();
      const zoom = map.getView().getZoom();
      if (!center || typeof zoom !== 'number') {
        return;
      }

      const [longitude, latitude] = toLonLat(center);
      dispatch(setMonitorMapView({ center: [latitude, longitude], zoom }));
    };

    const handleMapClick = (evt: { pixel: number[]; coordinate: number[] }) => {
      const feature = map.forEachFeatureAtPixel(
        evt.pixel,
        (candidate) => {
          if (candidate.get('nwsAlert')) {
            return candidate;
          }
        },
        { layerFilter: (layer) => layer === alertsLayer, hitTolerance: 6 },
      );

      if (feature && refs.overlayRef.current) {
        const details = parseNwsAlertFromOlProperties(feature.getProperties() as Record<string, unknown>);
        if (details) {
          onSelectAlert(details);
          refs.overlayRef.current.setPosition(evt.coordinate);
          return;
        }
      }

      if (refs.overlayRef.current) {
        hideOverlay(refs.overlayRef.current);
      }
      onSelectAlert(null);
    };

    const handlePointerMove = (evt: { pixel: number[] }) => {
      const target = map.getTargetElement();
      if (!(target instanceof HTMLElement)) {
        return;
      }

      target.style.cursor = map.hasFeatureAtPixel(evt.pixel, {
        layerFilter: (layer) => layer === alertsLayer,
        hitTolerance: 6,
      }) ? 'pointer' : '';
    };

    map.on('moveend', handleMoveEnd);
    map.on('click', handleMapClick);
    map.on('pointermove', handlePointerMove);

    if (popupRef.current) {
      const overlay = new Overlay({ element: popupRef.current, autoPan: false });
      map.addOverlay(overlay);
      refs.overlayRef.current = overlay;
    }

    refs.mapRef.current = map;
    refs.radarLayerRef.current = radarLayerInstance;
    refs.satelliteLayerRef.current = satelliteLayerInstance;
    refs.alertsLayerRef.current = alertsLayer;
    refs.vectorReferenceGroupRef.current = vectorReferenceGroup;

    loadUsStateOutlines(refs.stateOutlineSourceRef.current, darkMode).catch(() => undefined);

    const requestId = refs.vectorStyleRequestRef.current + 1;
    refs.vectorStyleRequestRef.current = requestId;
    getOpenFreeMapStyleSet('osm')
      .then(({ overlayStyle }) => {
        const nextReferenceGroup = new LayerGroup();
        return apply(nextReferenceGroup, overlayStyle).then(() => nextReferenceGroup);
      })
      .then((nextReferenceGroup) => {
        if (refs.vectorStyleRequestRef.current !== requestId || !refs.vectorReferenceGroupRef.current) {
          return;
        }

        replaceLayerGroupLayers(refs.vectorReferenceGroupRef.current, nextReferenceGroup);
        refs.vectorReferenceGroupRef.current.setZIndex(TOP_VECTOR_REFERENCE_LAYER_Z_INDEX);
        refs.vectorReferenceGroupRef.current.setVisible(true);
      })
      .catch(() => undefined);

    return () => {
      map.un('moveend', handleMoveEnd);
      map.un('click', handleMapClick);
      map.un('pointermove', handlePointerMove);
      const target = map.getTargetElement();
      if (target instanceof HTMLElement) {
        target.style.cursor = '';
      }
      map.setTarget();
      refs.overlayRef.current = null;
      refs.mapRef.current = null;
      refs.radarLayerRef.current = null;
      refs.satelliteLayerRef.current = null;
      refs.alertsLayerRef.current = null;
      refs.vectorReferenceGroupRef.current = null;
      refs.radarLayerKeyRef.current = null;
      refs.satelliteLayerKeyRef.current = null;
    };
  }, [darkMode, dispatch]);
};
