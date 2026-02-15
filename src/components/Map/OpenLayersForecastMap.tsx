import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import 'ol/ol.css';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { Draw, Modify, Select } from 'ol/interaction';
import { Fill, Stroke, Style } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import type { FeatureLike } from 'ol/Feature';
import { click } from 'ol/events/condition';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '../../lib/utils';
import { RootState } from '../../store';
import { addFeature, removeFeature, selectCurrentOutlooks, setMapView, updateFeature } from '../../store/forecastSlice';
import { getFeatureStyle } from '../../utils/mapStyleUtils';
import type { MapAdapterHandle } from '../../maps/contracts';
import type { Feature as GeoJsonFeature, GeoJsonProperties, Polygon } from 'geojson';
import Legend from './Legend';
import StatusOverlay from './StatusOverlay';
import './ForecastMap.css';

type OutlookMapLike = Record<string, globalThis.Map<string, GeoJsonFeature[]>>;

const toOlStyle = (outlookType: string, probability: string) => {
  const style = getFeatureStyle(outlookType as any, probability);
  return new Style({
    fill: new Fill({ color: style.fillColor || 'rgba(255,255,255,0.4)' }),
    stroke: new Stroke({ color: style.color || '#000', width: style.weight || 2 })
  });
};

const OpenLayersForecastMap = forwardRef<MapAdapterHandle<OLMap>>((_, ref) => {
  const dispatch = useDispatch();
  const [interactionMode, setInteractionMode] = useState<'draw' | 'delete'>('draw');
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const currentMapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const outlooks = useSelector(selectCurrentOutlooks) as OutlookMapLike;
  const initialMapViewRef = useRef(currentMapView);
  const currentMapViewRef = useRef(currentMapView);

  useEffect(() => {
    currentMapViewRef.current = currentMapView;
  }, [currentMapView]);

  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OLMap | null>(null);
  const vectorSourceRef = useRef<VectorSource>(new VectorSource());
  const drawRef = useRef<Draw | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const selectRef = useRef<Select | null>(null);
  const isApplyingExternalViewRef = useRef(false);

  const serializedFeatures = useMemo(() => {
    const items: Array<{ outlookType: string; probability: string; feature: GeoJsonFeature }> = [];
    Object.entries(outlooks).forEach(([outlookType, probs]) => {
      if (!(probs instanceof Map)) return;
      probs.forEach((features: GeoJsonFeature[], probability: string) => {
        features.forEach((feature: GeoJsonFeature) => {
          items.push({ outlookType, probability, feature });
        });
      });
    });
    return items;
  }, [outlooks]);

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
    getEngine: () => 'openlayers',
    getView: () => {
      if (!mapRef.current) {
        return { center: [39.8283, -98.5795] as [number, number], zoom: 4 };
      }
      const view = mapRef.current.getView();
      const center = view.getCenter();
      const zoom = view.getZoom() || 4;
      const lonLat = center ? (toLonLat(center) as [number, number]) : ([-98.5795, 39.8283] as [number, number]);
      return { center: [lonLat[1], lonLat[0]], zoom };
    }
  }), []);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const tileLayer = new TileLayer({ source: new OSM() });
    const vectorLayer = new VectorLayer({ source: vectorSourceRef.current });

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [tileLayer, vectorLayer],
      view: new View({
        center: fromLonLat([initialMapViewRef.current.center[1], initialMapViewRef.current.center[0]]),
        zoom: initialMapViewRef.current.zoom
      })
    });

    map.on('moveend', () => {
      if (isApplyingExternalViewRef.current) {
        return;
      }

      const view = map.getView();
      const center = view.getCenter();
      if (!center) return;
      const [lon, lat] = toLonLat(center);
      const nextCenter: [number, number] = [lat, lon];
      const nextZoom = view.getZoom() || 4;
      const [stateLat, stateLon] = currentMapViewRef.current.center;
      const stateZoom = currentMapViewRef.current.zoom;

      const centerChanged = Math.abs(stateLat - nextCenter[0]) > 0.000001 || Math.abs(stateLon - nextCenter[1]) > 0.000001;
      const zoomChanged = Math.abs(stateZoom - nextZoom) > 0.000001;

      if (centerChanged || zoomChanged) {
        dispatch(setMapView({ center: nextCenter, zoom: nextZoom }));
      }
    });

    mapRef.current = map;

    const modify = new Modify({ source: vectorSourceRef.current });
    modify.on('modifyend', (event) => {
      const format = new GeoJSON();
      event.features.forEach((feature) => {
        const geometry = feature.getGeometry();
        if (!geometry) {
          return;
        }

        const featureId = feature.get('featureId') as string | undefined;
        const outlookType = feature.get('outlookType') as string | undefined;
        const probability = feature.get('probability') as string | undefined;

        if (!featureId || !outlookType || !probability) {
          return;
        }

        const geoJsonGeometry = format.writeGeometryObject(geometry, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857'
        });
        const updatedFeature: GeoJsonFeature = {
          type: 'Feature',
          id: featureId,
          geometry: geoJsonGeometry as Polygon,
          properties: {
            outlookType,
            probability,
            isSignificant: Boolean(feature.get('isSignificant'))
          }
        };

        dispatch(updateFeature({ feature: updatedFeature }));
      });
    });
    map.addInteraction(modify);
    modifyRef.current = modify;

    const select = new Select({ condition: click });
    select.setActive(false);
    select.on('select', (event) => {
      const selected = event.selected[0];
      if (!selected) {
        return;
      }

      const featureId = selected.get('featureId') as string | undefined;
      const outlookType = selected.get('outlookType') as string | undefined;
      const probability = selected.get('probability') as string | undefined;

      if (featureId && outlookType && probability) {
        dispatch(removeFeature({
          outlookType: outlookType as any,
          probability,
          featureId
        }));
      }

      select.getFeatures().clear();
    });
    map.addInteraction(select);
    selectRef.current = select;

    return () => {
      if (drawRef.current) {
        map.removeInteraction(drawRef.current);
      }
      if (modifyRef.current) {
        map.removeInteraction(modifyRef.current);
      }
      if (selectRef.current) {
        map.removeInteraction(selectRef.current);
      }
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    if (!selectRef.current) {
      return;
    }

    selectRef.current.setActive(interactionMode === 'delete');
    if (interactionMode === 'draw') {
      selectRef.current.getFeatures().clear();
    }
  }, [interactionMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const view = map.getView();
    const targetCenter = fromLonLat([currentMapView.center[1], currentMapView.center[0]]);
    const currentCenter = view.getCenter();
    const currentZoom = view.getZoom() || 4;

    const centerChanged = !currentCenter || Math.abs(currentCenter[0] - targetCenter[0]) > 0.01 || Math.abs(currentCenter[1] - targetCenter[1]) > 0.01;
    const zoomChanged = Math.abs(currentZoom - currentMapView.zoom) > 0.000001;

    if (!centerChanged && !zoomChanged) {
      return;
    }

    isApplyingExternalViewRef.current = true;
    view.setCenter(targetCenter);
    view.setZoom(currentMapView.zoom);
    setTimeout(() => {
      isApplyingExternalViewRef.current = false;
    }, 0);
  }, [currentMapView.center, currentMapView.zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (drawRef.current) {
      map.removeInteraction(drawRef.current);
      drawRef.current = null;
    }

    if (interactionMode !== 'draw') {
      return;
    }

    if (drawingState.activeOutlookType === 'categorical' || drawingState.activeOutlookType === 'tornado' || drawingState.activeOutlookType === 'wind' || drawingState.activeOutlookType === 'hail' || drawingState.activeOutlookType === 'totalSevere' || drawingState.activeOutlookType === 'day4-8') {
      const draw = new Draw({ source: vectorSourceRef.current, type: 'Polygon' });
      draw.on('drawend', (event) => {
        const format = new GeoJSON();
        const olGeometry = event.feature.getGeometry();
        if (!olGeometry) {
          return;
        }

        const geometry = format.writeGeometryObject(olGeometry, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857'
        });
        const feature: GeoJsonFeature<Polygon, GeoJsonProperties> = {
          type: 'Feature',
          id: uuidv4(),
          geometry: geometry as Polygon,
          properties: {
            outlookType: drawingState.activeOutlookType,
            probability: drawingState.activeProbability,
            isSignificant: drawingState.isSignificant
          }
        };
        dispatch(addFeature({ feature }));
      });
      map.addInteraction(draw);
      drawRef.current = draw;
    }
  }, [dispatch, drawingState.activeOutlookType, drawingState.activeProbability, drawingState.isSignificant, interactionMode]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    source.clear();
    const format = new GeoJSON();

    serializedFeatures.forEach(({ outlookType, probability, feature }) => {
      const olFeature = format.readFeature(feature, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      });
      if (Array.isArray(olFeature)) {
        olFeature.forEach((item: FeatureLike) => {
          if ('setStyle' in item && typeof item.setStyle === 'function') {
            item.setStyle(toOlStyle(outlookType, probability));
          }
          if ('set' in item && typeof item.set === 'function') {
            item.set('featureId', feature.id as string);
            item.set('outlookType', outlookType);
            item.set('probability', probability);
            item.set('isSignificant', Boolean(feature.properties?.isSignificant));
          }
          source.addFeature(item as any);
        });
        return;
      }

      olFeature.setStyle(toOlStyle(outlookType, probability));
      olFeature.set('featureId', feature.id as string);
      olFeature.set('outlookType', outlookType);
      olFeature.set('probability', probability);
      olFeature.set('isSignificant', Boolean(feature.properties?.isSignificant));
      source.addFeature(olFeature);
    });
  }, [serializedFeatures]);

  return (
    <div className="map-container">
      <div ref={mapElementRef} style={{ width: '100%', height: '100%' }} />
      <div className="absolute top-3 right-3 z-[850] flex flex-col gap-2">
        <div className="flex items-center rounded-md border border-border bg-background/95 p-1 shadow-md">
          <button
            type="button"
            onClick={() => setInteractionMode('draw')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded transition-colors',
              interactionMode === 'draw'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => setInteractionMode('delete')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded transition-colors',
              interactionMode === 'delete'
                ? 'bg-destructive text-destructive-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            Delete
          </button>
        </div>
        <div className="max-w-[240px] rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-foreground shadow-md">
          {interactionMode === 'draw'
            ? 'Draw mode: click to place points and double-click to finish polygon.'
            : 'Delete mode: click any polygon to remove it.'}
        </div>
      </div>
      <Legend />
      <StatusOverlay />
    </div>
  );
});

OpenLayersForecastMap.displayName = 'OpenLayersForecastMap';

export default OpenLayersForecastMap;
