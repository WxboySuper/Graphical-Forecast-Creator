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
import type { FeatureLike } from 'ol/Feature';
import type { Feature as GeoJsonFeature } from 'geojson';
import { fromLonLat, toLonLat } from 'ol/proj';
import type { OutlookData, OutlookType } from '../../types/outlooks';
import { setMonitorMapView } from '../../store/monitorSlice';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import type { MonitorMapView } from '../../monitor/types';
import type { WmsLayerConfig } from '../../monitor/wms';
import { toOlStyle } from '../Map/OpenLayersForecastMap';

interface MonitorMapProps {
  mapView: MonitorMapView;
  radarLayer: WmsLayerConfig | null;
  radarOpacity: number;
  satelliteLayer: WmsLayerConfig | null;
  satelliteOpacity: number;
  outlookData?: OutlookData;
}

const createBaseSource = () => new XYZ({
  url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
  attributions: '&copy; OpenStreetMap &copy; CARTO',
  crossOrigin: 'anonymous',
  maxZoom: 19,
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

const buildWmsParams = (config: WmsLayerConfig) => ({
  LAYERS: config.layer,
  TILED: true,
  ...(config.latestTime ? { TIME: config.latestTime } : {}),
});

const applyWmsLayer = (
  layer: TileLayer<TileWMS>,
  config: WmsLayerConfig | null,
  opacity: number
) => {
  if (!config) {
    layer.setVisible(false);
    return;
  }

  const source = layer.getSource();
  if (source) {
    source.updateParams(buildWmsParams(config));
  } else {
    layer.setSource(createWmsSource(config));
  }

  layer.setOpacity(opacity);
  layer.setVisible(true);
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
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OLMap | null>(null);
  const radarLayerRef = useRef<TileLayer<TileWMS> | null>(null);
  const satelliteLayerRef = useRef<TileLayer<TileWMS> | null>(null);
  const outlookSourceRef = useRef(new VectorSource());
  const applyingExternalViewRef = useRef(false);
  const serializedFeatures = useMemo(() => flattenOutlookFeatures(outlookData), [outlookData]);

  useEffect(() => {
    if (!mapElementRef.current) {
      return;
    }

    const baseLayer = new TileLayer({ source: createBaseSource() });
    const satelliteLayerInstance = new TileLayer<TileWMS>({ visible: false, opacity: satelliteOpacity });
    const radarLayerInstance = new TileLayer<TileWMS>({ visible: false, opacity: radarOpacity });
    const outlookLayer = new VectorLayer({
      source: outlookSourceRef.current,
      opacity: 0.9,
      zIndex: 100,
    });

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        baseLayer,
        satelliteLayerInstance,
        radarLayerInstance,
        outlookLayer,
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

    return () => {
      map.un('moveend', handleMoveEnd);
      map.setTarget(undefined);
      mapRef.current = null;
      radarLayerRef.current = null;
      satelliteLayerRef.current = null;
    };
  }, [dispatch]);

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
      applyWmsLayer(radarLayerRef.current, radarLayer, radarOpacity);
    }
  }, [radarLayer?.layer, radarLayer?.url, radarLayer, radarOpacity]);

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
      applyWmsLayer(satelliteLayerRef.current, satelliteLayer, satelliteOpacity);
    }
  }, [satelliteLayer?.layer, satelliteLayer?.url, satelliteLayer, satelliteOpacity]);

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
