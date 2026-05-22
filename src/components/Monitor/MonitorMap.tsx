import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'ol/ol.css';
import OLMap from 'ol/Map';
import View from 'ol/View';
import Overlay from 'ol/Overlay';
import LayerGroup from 'ol/layer/Group';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import TileWMS from 'ol/source/TileWMS';
import { fromLonLat, toLonLat } from 'ol/proj';
import type { StormReport } from '../../types/stormReports';
import type { NwsAlertFeatureCollection } from '../../monitor/nwsAlerts';
import { buildNwsAlertStyle } from '../../monitor/nwsAlerts';
import type { NwsAlertDetails } from '../../monitor/nwsAlertDetails';
import { parseNwsAlertFromOlProperties } from '../../monitor/nwsAlertDetails';
import MonitorAlertPopup from './MonitorAlertPopup';
import { hideOverlay } from '../Map/OpenLayersForecastMap';
import { useDispatch, useSelector } from 'react-redux';
import type { OutlookData } from '../../types/outlooks';
import type { MonitorMapView, MonitorOutlookLayerType } from '../../monitor/types';
import { flattenMonitorOutlookFeatures } from '../../monitor/outlookLayers';
import type { AppDispatch, RootState } from '../../store';
import { setMonitorMapView } from '../../store/monitorSlice';
import type { WmsLayerConfig } from '../../monitor/wms';
import { getOpenFreeMapStyleSet } from '../../lib/openFreeMap';
import { apply } from 'ol-mapbox-style';
import {
  ALERTS_LAYER_Z_INDEX,
  applyWmsLayer,
  BASE_LAYER_Z_INDEX,
  buildWmsParams,
  createBaseSource,
  createStateOutlineStyle,
  loadUsStateOutlines,
  OUTLOOK_LAYER_Z_INDEX,
  RADAR_LAYER_Z_INDEX,
  replaceLayerGroupLayers,
  SATELLITE_LAYER_Z_INDEX,
  STATE_OUTLINE_LAYER_Z_INDEX,
  STORM_REPORTS_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
} from './monitorMapLayerUtils';
import { syncAlertFeatures, syncOutlookFeatures, syncStormReportFeatures } from './monitorMapFeatureSync';

interface MonitorMapProps {
  mapView: MonitorMapView;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  outlookData?: OutlookData;
  outlookType: MonitorOutlookLayerType;
  stormReports: StormReport[];
  alertsCollection: NwsAlertFeatureCollection;
  alertsOpacity: number;
}

const MonitorMap: React.FC<MonitorMapProps> = ({
  mapView,
  radarLayer,
  radarOpacity,
  satelliteLayer,
  satelliteOpacity,
  outlookData,
  outlookType,
  stormReports,
  alertsCollection,
  alertsOpacity,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const [selectedAlert, setSelectedAlert] = useState<NwsAlertDetails | null>(null);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const mapRef = useRef<OLMap | null>(null);
  const radarLayerRef = useRef<TileLayer<TileWMS> | null>(null);
  const satelliteLayerRef = useRef<TileLayer<TileWMS> | null>(null);
  const alertsLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const vectorReferenceGroupRef = useRef<LayerGroup | null>(null);
  const vectorStyleRequestRef = useRef(0);
  const radarLayerKeyRef = useRef<string | null>(null);
  const satelliteLayerKeyRef = useRef<string | null>(null);
  const outlookSourceRef = useRef(new VectorSource());
  const alertsSourceRef = useRef(new VectorSource());
  const stormReportsSourceRef = useRef(new VectorSource());
  const stateOutlineSourceRef = useRef(new VectorSource());
  const applyingExternalViewRef = useRef(false);
  const serializedFeatures = useMemo(
    () => flattenMonitorOutlookFeatures(outlookData, outlookType),
    [outlookData, outlookType],
  );

  useEffect(() => {
    if (!mapElementRef.current) {
      return;
    }

    const baseLayer = new TileLayer({
      source: createBaseSource(darkMode),
      zIndex: BASE_LAYER_Z_INDEX,
    });
    const vectorReferenceGroup = new LayerGroup({
      visible: false,
      zIndex: TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
    });
    const satelliteLayerInstance = new TileLayer<TileWMS>({
      visible: false,
      opacity: satelliteOpacity,
      zIndex: SATELLITE_LAYER_Z_INDEX,
    });
    const radarLayerInstance = new TileLayer<TileWMS>({
      visible: false,
      opacity: radarOpacity,
      zIndex: RADAR_LAYER_Z_INDEX,
    });
    const alertsLayer = new VectorLayer({
      source: alertsSourceRef.current,
      opacity: alertsOpacity,
      zIndex: ALERTS_LAYER_Z_INDEX,
      style: (feature) => {
        const event = String(feature.get('event') ?? '');
        return buildNwsAlertStyle(event);
      },
    });
    const outlookLayer = new VectorLayer({
      source: outlookSourceRef.current,
      zIndex: OUTLOOK_LAYER_Z_INDEX,
    });
    const stormReportsLayer = new VectorLayer({
      source: stormReportsSourceRef.current,
      zIndex: STORM_REPORTS_LAYER_Z_INDEX,
    });
    const stateOutlineLayer = new VectorLayer({
      source: stateOutlineSourceRef.current,
      zIndex: STATE_OUTLINE_LAYER_Z_INDEX,
    });

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        baseLayer,
        satelliteLayerInstance,
        radarLayerInstance,
        alertsLayer,
        outlookLayer,
        stormReportsLayer,
        stateOutlineLayer,
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
      if (applyingExternalViewRef.current) {
        return;
      }

      const view = map.getView();
      const center = view.getCenter();
      const zoom = view.getZoom();
      if (!center || typeof zoom !== 'number') {
        return;
      }

      const [longitude, latitude] = toLonLat(center);
      dispatch(setMonitorMapView({
        center: [latitude, longitude],
        zoom,
      }));
    };

    map.on('moveend', handleMoveEnd);

    if (popupRef.current) {
      const overlay = new Overlay({
        element: popupRef.current,
        autoPan: false,
      });
      map.addOverlay(overlay);
      overlayRef.current = overlay;
    }

    const handleMapClick = (evt: { pixel: number[]; coordinate: number[] }) => {
      const feature = map.forEachFeatureAtPixel(
        evt.pixel,
        (candidate) => {
          if (candidate.get('nwsAlert')) {
            return candidate;
          }
        },
        {
          layerFilter: (layer) => layer === alertsLayer,
          hitTolerance: 6,
        },
      );

      if (feature && overlayRef.current) {
        const details = parseNwsAlertFromOlProperties(feature.getProperties() as Record<string, unknown>);
        if (details) {
          setSelectedAlert(details);
          overlayRef.current.setPosition(evt.coordinate);
          return;
        }
      }

      if (overlayRef.current) {
        hideOverlay(overlayRef.current);
      }
      setSelectedAlert(null);
    };

    const handlePointerMove = (evt: { pixel: number[] }) => {
      const target = map.getTargetElement();
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const hitAlert = map.hasFeatureAtPixel(evt.pixel, {
        layerFilter: (layer) => layer === alertsLayer,
        hitTolerance: 6,
      });
      target.style.cursor = hitAlert ? 'pointer' : '';
    };

    map.on('click', handleMapClick);
    map.on('pointermove', handlePointerMove);

    mapRef.current = map;
    radarLayerRef.current = radarLayerInstance;
    satelliteLayerRef.current = satelliteLayerInstance;
    alertsLayerRef.current = alertsLayer;
    vectorReferenceGroupRef.current = vectorReferenceGroup;

    loadUsStateOutlines(stateOutlineSourceRef.current, darkMode).catch(() => {
      // State outlines are optional reference context.
    });

    const requestId = vectorStyleRequestRef.current + 1;
    vectorStyleRequestRef.current = requestId;

    getOpenFreeMapStyleSet('osm')
      .then(({ overlayStyle }) => {
        const nextReferenceGroup = new LayerGroup();
        return apply(nextReferenceGroup, overlayStyle).then(() => nextReferenceGroup);
      })
      .then((nextReferenceGroup) => {
        if (vectorStyleRequestRef.current !== requestId || !vectorReferenceGroupRef.current) {
          return;
        }

        replaceLayerGroupLayers(vectorReferenceGroupRef.current, nextReferenceGroup);
        vectorReferenceGroupRef.current.setZIndex(TOP_VECTOR_REFERENCE_LAYER_Z_INDEX);
        vectorReferenceGroupRef.current.setVisible(true);
      })
      .catch(() => {
        // Vector roads/labels are optional reference context.
      });

    return () => {
      map.un('moveend', handleMoveEnd);
      map.un('click', handleMapClick);
      map.un('pointermove', handlePointerMove);
      const target = map.getTargetElement();
      if (target instanceof HTMLElement) {
        target.style.cursor = '';
      }
      map.setTarget();
      overlayRef.current = null;
      mapRef.current = null;
      radarLayerRef.current = null;
      satelliteLayerRef.current = null;
      alertsLayerRef.current = null;
      vectorReferenceGroupRef.current = null;
      radarLayerKeyRef.current = null;
      satelliteLayerKeyRef.current = null;
    };
  }, [darkMode, dispatch]);

  useEffect(() => {
    const source = stateOutlineSourceRef.current;
    const style = createStateOutlineStyle(darkMode);
    source.getFeatures().forEach((feature) => feature.setStyle(style));
  }, [darkMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const view = map.getView();
    const targetCenter = fromLonLat([mapView.center[1], mapView.center[0]]);
    applyingExternalViewRef.current = true;
    view.setCenter(targetCenter);
    view.setZoom(mapView.zoom);
    window.setTimeout(() => {
      applyingExternalViewRef.current = false;
    }, 0);
  }, [mapView.center, mapView.zoom]);

  useEffect(() => {
    if (radarLayerRef.current) {
      applyWmsLayer(radarLayerRef.current, radarLayer, radarOpacity, radarLayerKeyRef);
    }
  }, [radarLayer, radarOpacity]);

  useEffect(() => {
    const tileLayer = radarLayerRef.current;
    const source = tileLayer?.getSource();
    if (!tileLayer || !source || !radarLayer) {
      return;
    }

    source.updateParams(buildWmsParams(radarLayer));
  }, [radarLayer?.latestTime]);

  useEffect(() => {
    if (satelliteLayerRef.current) {
      applyWmsLayer(satelliteLayerRef.current, satelliteLayer, satelliteOpacity, satelliteLayerKeyRef);
    }
  }, [satelliteLayer, satelliteOpacity]);

  useEffect(() => {
    const tileLayer = satelliteLayerRef.current;
    const source = tileLayer?.getSource();
    if (!tileLayer || !source || !satelliteLayer) {
      return;
    }

    source.updateParams(buildWmsParams(satelliteLayer));
  }, [satelliteLayer?.latestTime]);

  useEffect(() => {
    syncOutlookFeatures(outlookSourceRef.current, serializedFeatures);
  }, [serializedFeatures]);

  useEffect(() => {
    alertsLayerRef.current?.setOpacity(alertsOpacity);
  }, [alertsOpacity]);

  useEffect(() => {
    syncAlertFeatures(alertsSourceRef.current, alertsCollection);
  }, [alertsCollection]);

  useEffect(() => {
    if (overlayRef.current) {
      hideOverlay(overlayRef.current);
    }
    setSelectedAlert(null);
  }, [alertsCollection]);

  useEffect(() => {
    syncStormReportFeatures(stormReportsSourceRef.current, stormReports);
  }, [stormReports]);

  const handleCloseAlertPopup = () => {
    if (overlayRef.current) {
      hideOverlay(overlayRef.current);
    }
    setSelectedAlert(null);
  };

  return (
    <div className="monitor-map" aria-label="Monitor map">
      <div ref={mapElementRef} className="monitor-map__viewport" />
      <div ref={popupRef} className="monitor-map__alertOverlay">
        {selectedAlert && (
          <MonitorAlertPopup details={selectedAlert} onClose={handleCloseAlertPopup} />
        )}
      </div>
      <div className="monitor-map__badge">Read-only monitor</div>
    </div>
  );
};

export default MonitorMap;
