import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import 'ol/ol.css';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { RootState } from '../../store';
import { selectVerificationOutlooksForDay } from '../../store/verificationSlice';
import { colorMappings } from '../../utils/outlookUtils';
import { DayType } from '../../types/outlooks';
import type { MapAdapterHandle } from '../../maps/contracts';
import type { Feature as GeoJsonFeature } from 'geojson';
import Legend from './Legend';
import './ForecastMap.css';

interface OpenLayersVerificationMapProps {
  activeOutlookType?: 'categorical' | 'tornado' | 'wind' | 'hail';
  selectedDay?: DayType;
}

const buildStyle = (type: string, probability: string) => {
  const typeColors = colorMappings[type as keyof typeof colorMappings];
  const defaultColor = '#999999';

  let color = defaultColor;
  if (typeColors && typeof typeColors !== 'string') {
    const mapped = typeColors[probability as keyof typeof typeColors];
    if (mapped && typeof mapped === 'string') {
      color = mapped;
    }
  }

  return new Style({
    stroke: new Stroke({ color, width: 2 }),
    fill: new Fill({ color: 'rgba(255,255,255,0.2)' })
  });
};

const OpenLayersVerificationMap = forwardRef<MapAdapterHandle<OLMap>, OpenLayersVerificationMapProps>(({ 
  activeOutlookType = 'categorical',
  selectedDay = 1
}, ref) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OLMap | null>(null);
  const vectorSourceRef = useRef<VectorSource>(new VectorSource());
  const mapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const initialMapViewRef = useRef(mapView);
  const outlooks = useSelector((state: RootState) => selectVerificationOutlooksForDay(state, selectedDay));

  const activeFeatures = useMemo(() => {
    const outlook = outlooks[activeOutlookType];
    if (!outlook) {
      return [] as Array<{ feature: GeoJsonFeature; probability: string }>;
    }

    const items: Array<{ feature: GeoJsonFeature; probability: string }> = [];
    outlook.forEach((features, probability) => {
      features.forEach((feature) => {
        items.push({ feature, probability });
      });
    });

    return items;
  }, [activeOutlookType, outlooks]);

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
    getEngine: () => 'openlayers',
    getView: () => ({
      center: mapView.center,
      zoom: mapView.zoom
    })
  }), [mapView.center, mapView.zoom]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({ source: vectorSourceRef.current })
      ],
      view: new View({
        center: fromLonLat([initialMapViewRef.current.center[1], initialMapViewRef.current.center[0]]),
        zoom: initialMapViewRef.current.zoom
      })
    });

    mapRef.current = map;

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const view = map.getView();
    const targetCenter = fromLonLat([mapView.center[1], mapView.center[0]]);
    const currentCenter = view.getCenter();
    const currentZoom = view.getZoom() || 4;

    const centerChanged = !currentCenter || Math.abs(currentCenter[0] - targetCenter[0]) > 0.01 || Math.abs(currentCenter[1] - targetCenter[1]) > 0.01;
    const zoomChanged = Math.abs(currentZoom - mapView.zoom) > 0.000001;

    if (!centerChanged && !zoomChanged) {
      return;
    }

    view.setCenter(targetCenter);
    view.setZoom(mapView.zoom);
  }, [mapView.center, mapView.zoom]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    source.clear();

    const format = new GeoJSON();

    activeFeatures.forEach(({ feature, probability }) => {
      const olFeature = format.readFeature(feature, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      });

      if (Array.isArray(olFeature)) {
        olFeature.forEach((item) => {
          item.setStyle(buildStyle(activeOutlookType, probability));
          source.addFeature(item);
        });
        return;
      }

      olFeature.setStyle(buildStyle(activeOutlookType, probability));
      source.addFeature(olFeature);
    });
  }, [activeFeatures, activeOutlookType]);

  return (
    <div className="forecast-map-container">
      <div ref={mapElementRef} style={{ width: '100%', height: '100%' }} />
      <Legend />
    </div>
  );
});

OpenLayersVerificationMap.displayName = 'OpenLayersVerificationMap';

export default OpenLayersVerificationMap;
