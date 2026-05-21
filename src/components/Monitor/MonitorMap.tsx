import React, { useEffect, useMemo, useRef } from 'react';
import 'ol/ol.css';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Stroke, Style } from 'ol/style';
import type { FeatureLike } from 'ol/Feature';
import type { Feature as GeoJsonFeature } from 'geojson';
import { fromLonLat, toLonLat } from 'ol/proj';
import { useDispatch, useSelector } from 'react-redux';
import type { OutlookData, OutlookType } from '../../types/outlooks';
import type { AppDispatch, RootState } from '../../store';
import { setMonitorMapView } from '../../store/monitorSlice';
import type { MonitorMapView } from '../../monitor/types';
import type { WmsLayerConfig } from '../../monitor/wms';
import { createLabelOverlaySource, toOlStyle } from '../Map/OpenLayersForecastMap';

interface MonitorMapProps {
  mapView: MonitorMapView;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  outlookData?: OutlookData;
}

const BASE_LAYER_Z_INDEX = 0;
const SATELLITE_LAYER_Z_INDEX = 10;
const RADAR_LAYER_Z_INDEX = 20;
const OUTLOOK_LAYER_Z_INDEX = 100;
const STATE_OUTLINE_LAYER_Z_INDEX = 110;
const LABEL_LAYER_Z_INDEX = 120;

const US_STATES_GEOJSON_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

const createBaseSource = () => new XYZ({
  url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
  attributions: '&copy; OpenStreetMap &copy; CARTO',
  crossOrigin: 'anonymous',
  maxZoom: 19,
});

const createStateOutlineStyle = (darkMode: boolean) => new Style({
  fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
  stroke: new Stroke({
    color: darkMode ? 'rgba(226, 232, 240, 0.72)' : 'rgba(51, 65, 85, 0.88)',
    width: 1.1,
  }),
});

const createWmsSource = (config: WmsLayerConfig): TileWMS => new TileWMS({
  url: config.url,
  params: {
    LAYERS: config.layer,
    TILED: true,
    ...(config.latestTime ? { TIME: config.latestTime } : {}),
  },
  serverType: 'geoserver',
  crossOrigin: 'anonymous',
});

const buildWmsParams = (config: WmsLayerConfig) => ({
  LAYERS: config.layer,
  TILED: true,
  ...(config.latestTime ? { TIME: config.latestTime } : {}),
});

const buildWmsLayerKey = (config: WmsLayerConfig): string => `${config.url}::${config.layer}`;

const flattenOutlookFeatures = (data?: OutlookData): Array<{ outlookType: OutlookType; probability: string; feature: GeoJsonFeature }> => {
  if (!data) {
    return [];
  }

  const items: Array<{ outlookType: OutlookType; probability: string; feature: GeoJsonFeature }> = [];
  (Object.entries(data) as Array<[OutlookType, Map<string, GeoJsonFeature[]> | undefined]>).forEach(([outlookType, map]) => {
    if (!(map instanceof Map)) {
      return;
    }

    map.forEach((features, probability) => {
      features.forEach((feature) => {
        items.push({ outlookType, probability, feature });
      });
    });
  });
  return items;
};

const applyWmsLayer = (
  layer: TileLayer<TileWMS>,
  config: WmsLayerConfig | null,
  opacity: number,
  activeLayerKeyRef: React.MutableRefObject<string | null>
) => {
  if (!config) {
    layer.setVisible(false);
    activeLayerKeyRef.current = null;
    return;
  }

  const nextLayerKey = buildWmsLayerKey(config);
  const source = layer.getSource();

  if (!source || activeLayerKeyRef.current !== nextLayerKey) {
    layer.setSource(createWmsSource(config));
    activeLayerKeyRef.current = nextLayerKey;
  } else {
    source.updateParams(buildWmsParams(config));
  }

  layer.setOpacity(opacity);
  layer.setVisible(true);
};

let cachedUsStatesGeoJSON: object | null = null;

const loadUsStateOutlines = async (source: VectorSource, darkMode: boolean) => {
  if (source.getFeatures().length > 0) {
    return;
  }

  if (!cachedUsStatesGeoJSON) {
    const response = await fetch(US_STATES_GEOJSON_URL);
    cachedUsStatesGeoJSON = await response.json() as object;
  }

  const format = new GeoJSON();
  const features = format.readFeatures(cachedUsStatesGeoJSON, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
  const style = createStateOutlineStyle(darkMode);
  features.forEach((feature) => {
    if ('setStyle' in feature && typeof feature.setStyle === 'function') {
      feature.setStyle(style);
    }
  });
  source.addFeatures(features as never);
};

const MonitorMap: React.FC<MonitorMapProps> = ({
  mapView,
  radarLayer,
  radarOpacity,
  satelliteLayer,
  satelliteOpacity,
  outlookData,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OLMap | null>(null);
  const radarLayerRef = useRef<TileLayer<TileWMS> | null>(null);
  const satelliteLayerRef = useRef<TileLayer<TileWMS> | null>(null);
  const labelLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const radarLayerKeyRef = useRef<string | null>(null);
  const satelliteLayerKeyRef = useRef<string | null>(null);
  const outlookSourceRef = useRef(new VectorSource());
  const stateOutlineSourceRef = useRef(new VectorSource());
  const applyingExternalViewRef = useRef(false);
  const serializedFeatures = useMemo(() => flattenOutlookFeatures(outlookData), [outlookData]);
  const labelStyle = darkMode ? 'carto-dark' : 'osm';

  useEffect(() => {
    if (!mapElementRef.current) {
      return;
    }

    const baseLayer = new TileLayer({
      source: createBaseSource(),
      zIndex: BASE_LAYER_Z_INDEX,
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
    const outlookLayer = new VectorLayer({
      source: outlookSourceRef.current,
      opacity: 0.9,
      zIndex: OUTLOOK_LAYER_Z_INDEX,
    });
    const stateOutlineLayer = new VectorLayer({
      source: stateOutlineSourceRef.current,
      zIndex: STATE_OUTLINE_LAYER_Z_INDEX,
    });
    const labelLayer = new TileLayer({
      source: createLabelOverlaySource(labelStyle) ?? undefined,
      visible: true,
      zIndex: LABEL_LAYER_Z_INDEX,
    });

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        baseLayer,
        satelliteLayerInstance,
        radarLayerInstance,
        outlookLayer,
        stateOutlineLayer,
        labelLayer,
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
    mapRef.current = map;
    radarLayerRef.current = radarLayerInstance;
    satelliteLayerRef.current = satelliteLayerInstance;
    labelLayerRef.current = labelLayer;

    loadUsStateOutlines(stateOutlineSourceRef.current, darkMode).catch(() => {
      // State outlines are optional reference context.
    });

    return () => {
      map.un('moveend', handleMoveEnd);
      map.setTarget(undefined);
      mapRef.current = null;
      radarLayerRef.current = null;
      satelliteLayerRef.current = null;
      labelLayerRef.current = null;
      radarLayerKeyRef.current = null;
      satelliteLayerKeyRef.current = null;
    };
  }, [dispatch, labelStyle]);

  useEffect(() => {
    const labelLayer = labelLayerRef.current;
    if (!labelLayer) {
      return;
    }

    labelLayer.setSource(createLabelOverlaySource(labelStyle) ?? undefined);
  }, [labelStyle]);

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
    const source = outlookSourceRef.current;
    source.clear();
    const format = new GeoJSON();

    serializedFeatures.forEach(({ outlookType, probability, feature }) => {
      const olFeature = format.readFeature(feature, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });

      const applyStyle = (item: FeatureLike) => {
        if ('setStyle' in item && typeof item.setStyle === 'function') {
          item.setStyle(toOlStyle({ outlookType, probability }, { isTopLayer: true }));
        }
        source.addFeature(item as never);
      };

      if (Array.isArray(olFeature)) {
        olFeature.forEach(applyStyle);
      } else {
        applyStyle(olFeature as FeatureLike);
      }
    });
  }, [serializedFeatures]);

  return (
    <div className="monitor-map" aria-label="Monitor map">
      <div ref={mapElementRef} className="monitor-map__viewport" />
      <div className="monitor-map__badge">Read-only monitor</div>
    </div>
  );
};

export default MonitorMap;
