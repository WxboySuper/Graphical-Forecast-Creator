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
import Overlay from 'ol/Overlay';
import type { FeatureLike } from 'ol/Feature';
import { click } from 'ol/events/condition';
import { v4 as uuidv4 } from 'uuid';
import { RootState } from '../../store';
import { addFeature, removeFeature, selectCurrentOutlooks, setMapView, updateFeature } from '../../store/forecastSlice';
import { getFeatureStyle, computeZIndex } from '../../utils/mapStyleUtils';
import type { MapAdapterHandle } from '../../maps/contracts';
import type { Feature as GeoJsonFeature, GeoJsonProperties, Polygon } from 'geojson';
import Legend from './Legend';
import StatusOverlay from './StatusOverlay';
import './ForecastMap.css';

type OutlookMapLike = Record<string, globalThis.Map<string, GeoJsonFeature[]>>;

const toRgbaColor = (color: string, alpha: number): string => {
  if (!color) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  if (color.startsWith('rgba(') || color.startsWith('hsla(')) {
    return color;
  }

  if (color.startsWith('rgb(') || color.startsWith('hsl(')) {
    return color;
  }

  const hex = color.replace('#', '');
  const normalized = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return color;
  }

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

// Create canvas pattern for CIG hatching
const createHatchPattern = (cigLevel: string): CanvasPattern | null => {
  const canvas = document.createElement('canvas');
  const size = 10;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return null;
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  
  if (cigLevel === 'CIG1') {
    // Broken diagonal lines
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(3, 3);
    ctx.moveTo(5, 5);
    ctx.lineTo(10, 10);
    ctx.stroke();
  } else if (cigLevel === 'CIG2') {
    // Solid diagonal
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size);
    ctx.stroke();
  } else if (cigLevel === 'CIG3') {
    // Crosshatch
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size);
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();
  }
  
  return ctx.createPattern(canvas, 'repeat');
};

const toOlStyle = (outlookType: string, probability: string, isTopLayer: boolean = false) => {
  const style = getFeatureStyle(outlookType as any, probability);
  const fillColor = style.fillColor || '#ffffff';
  const fillOpacity = typeof style.fillOpacity === 'number' ? style.fillOpacity : 0.25;
  const strokeOpacity = typeof style.opacity === 'number' ? style.opacity : 1;
  const strokeColor = style.color || '#000000';
  const zIndex = computeZIndex(outlookType as any, probability);

  // Handle CIG hatching patterns
  let fill: Fill;
  if (probability.startsWith('CIG')) {
    const pattern = createHatchPattern(probability);
    if (pattern) {
      fill = new Fill({ color: pattern as any });
    } else {
      // Fallback to transparent
      fill = new Fill({ color: 'rgba(0, 0, 0, 0)' });
    }
  } else {
    fill = new Fill({
      color: toRgbaColor(String(fillColor), fillOpacity)
    });
  }

  const olStyle = new Style({
    fill: fill,
    stroke: new Stroke({
      color: toRgbaColor(String(strokeColor), strokeOpacity),
      width: isTopLayer ? 3 : (style.weight || 2)
    }),
    zIndex: zIndex
  });
  
  return olStyle;
};

const OpenLayersForecastMap = forwardRef<MapAdapterHandle<OLMap>>((_, ref) => {
  const dispatch = useDispatch();
  const [interactionMode, setInteractionMode] = useState<'pan' | 'draw' | 'delete'>('pan');
  const [popupInfo, setPopupInfo] = useState<{ outlookType: string; probability: string; isSignificant: boolean } | null>(null);
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const currentMapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const outlooks = useSelector(selectCurrentOutlooks) as OutlookMapLike;
  const initialMapViewRef = useRef(currentMapView);
  const currentMapViewRef = useRef(currentMapView);
  const popupRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const interactionModeRef = useRef(interactionMode);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

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
      if (outlookType !== drawingState.activeOutlookType) {
        return;
      }

      if (!(probs instanceof Map)) return;
      probs.forEach((features: GeoJsonFeature[], probability: string) => {
        features.forEach((feature: GeoJsonFeature) => {
          items.push({ outlookType, probability, feature });
        });
      });
    });
    return items;
  }, [outlooks, drawingState.activeOutlookType]);

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

    // Create popup overlay
    if (popupRef.current) {
      const overlay = new Overlay({
        element: popupRef.current,
        autoPan: {
          animation: {
            duration: 250,
          },
        },
      });
      map.addOverlay(overlay);
      overlayRef.current = overlay;
    }

    // Add click handler for pan mode
    map.on('click', (evt) => {
      if (interactionModeRef.current !== 'pan') {
        return;
      }

      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (feature && overlayRef.current) {
        const outlookType = feature.get('outlookType') as string;
        const probability = feature.get('probability') as string;
        const isSignificant = feature.get('isSignificant') as boolean;
        
        setPopupInfo({ outlookType, probability, isSignificant });
        overlayRef.current.setPosition(evt.coordinate);
      } else if (overlayRef.current) {
        overlayRef.current.setPosition(undefined);
        setPopupInfo(null);
      }
    });

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
    if (interactionMode !== 'delete') {
      selectRef.current.getFeatures().clear();
    }

    // Hide popup when not in pan mode
    if (interactionMode !== 'pan') {
      if (overlayRef.current) {
        overlayRef.current.setPosition(undefined);
      }
      setPopupInfo(null);
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

    // Find the maximum z-index for bold styling
    let maxZIndex = -Infinity;
    serializedFeatures.forEach(({ outlookType, probability }) => {
      const zIndex = computeZIndex(outlookType as any, probability);
      if (zIndex > maxZIndex) {
        maxZIndex = zIndex;
      }
    });

    serializedFeatures.forEach(({ outlookType, probability, feature }) => {
      const olFeature = format.readFeature(feature, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      });
      
      const zIndex = computeZIndex(outlookType as any, probability);
      const isTopLayer = zIndex === maxZIndex;
      
      if (Array.isArray(olFeature)) {
        olFeature.forEach((item: FeatureLike) => {
          if ('setStyle' in item && typeof item.setStyle === 'function') {
            item.setStyle(toOlStyle(outlookType, probability, isTopLayer));
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

      olFeature.setStyle(toOlStyle(outlookType, probability, isTopLayer));
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
      <div
        ref={popupRef}
        className="ol-popup"
        style={{
          display: popupInfo ? 'block' : 'none',
        }}
      >
        {popupInfo && (
          <div className="ol-popup-content">
            <div className="text-sm font-semibold capitalize">{popupInfo.outlookType}</div>
            <div className="text-xs">
              {popupInfo.probability}{popupInfo.isSignificant ? ' (Significant)' : ''}
            </div>
          </div>
        )}
      </div>
      <div className="map-toolbar-bottom-right">
        <div className="flex items-center gap-1 rounded-md bg-white dark:bg-gray-800 p-1 shadow-md border border-gray-300 dark:border-gray-600">
          <button
            type="button"
            className={`map-toolbar-button mode-pan ${interactionMode === 'pan' ? 'active' : ''}`}
            onClick={() => setInteractionMode('pan')}
            title="Pan map"
            aria-label="Pan map"
          >
            Pan
          </button>
          <button
            type="button"
            onClick={() => setInteractionMode('draw')}
            className={`map-toolbar-button mode-draw ${interactionMode === 'draw' ? 'active' : ''}`}
            title="Draw polygons"
            aria-label="Draw polygons"
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => setInteractionMode('delete')}
            className={`map-toolbar-button mode-delete ${interactionMode === 'delete' ? 'active' : ''}`}
            title="Delete polygons"
            aria-label="Delete polygons"
          >
            Delete
          </button>
        </div>
        <div className="max-w-[260px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 shadow-md">
          {interactionMode === 'draw' && 'Draw mode: click to place points, double-click to finish polygon.'}
          {interactionMode === 'delete' && 'Delete mode: click any polygon to remove it.'}
          {interactionMode === 'pan' && 'Pan mode: drag map to move, scroll to zoom. Click a polygon to see its details.'}
        </div>
      </div>
      <Legend />
      <StatusOverlay />
    </div>
  );
});

OpenLayersForecastMap.displayName = 'OpenLayersForecastMap';

export default OpenLayersForecastMap;
