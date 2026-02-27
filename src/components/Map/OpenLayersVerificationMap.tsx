import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import 'ol/ol.css';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import GeoJSON from 'ol/format/GeoJSON';
import { Fill, Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { RootState } from '../../store';
import { selectVerificationOutlooksForDay } from '../../store/verificationSlice';
import { setBaseMapStyle } from '../../store/overlaysSlice';
import type { BaseMapStyle } from '../../store/overlaysSlice';
import { computeZIndex, getFeatureStyle } from '../../utils/mapStyleUtils';
import { DayType } from '../../types/outlooks';
import type { MapAdapterHandle } from '../../maps/contracts';
import type { Feature as GeoJsonFeature } from 'geojson';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Circle, Fill as StyleFill, Stroke as StyleStroke, Style as OlStyle } from 'ol/style';
import Legend from './Legend';
import UnofficialBadge from './UnofficialBadge';
import './ForecastMap.css';
import { ReportType } from '../../types/stormReports';


interface OpenLayersVerificationMapProps {
  activeOutlookType?: 'categorical' | 'tornado' | 'wind' | 'hail';
  selectedDay?: DayType;
}

// Define specific colors for each report type
const reportColors = {
  tornado: '#FF0000', // Red for tornado
  wind: '#0000FF',    // Blue for wind
  hail: '#00FF00',    // Green for hail
};

// Style function for storm reports
const buildReportStyle = (type: ReportType) => {
  return new OlStyle({
    image: new Circle({
      radius: 6,
      fill: new StyleFill({
        color: reportColors[type] || '#888888', // Fallback to grey
      }),
      stroke: new StyleStroke({
        color: '#FFFFFF', // White border
        width: 1,
      }),
    }),
  });
};

// Cached US states GeoJSON for blank map style (fetched once per session)
let cachedUsStatesGeoJSONVerif: any = null;

const BLANK_LAND_STYLE_VERIF = new Style({
  fill: new Fill({ color: '#f2ede2' }),
  stroke: new Stroke({ color: '#9e9585', width: 1 }),
});

const createVerifTileSource = (style: Exclude<BaseMapStyle, 'blank'>): OSM | XYZ => {
  switch (style) {
    case 'carto-light':
      return new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      });
    case 'carto-dark':
      return new XYZ({
        url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      });
    case 'esri-satellite':
      return new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles &copy; Esri &mdash; Source: Esri i-cubed USDA USGS AEX GeoEye Getmapping Aerogrid IGN IGP UPR-EGP',
        maxZoom: 19,
      });
    case 'osm':
    default:
      return new OSM();
  }
};

const createHatchPattern = (cigLevel: string): CanvasPattern | null => {
  const canvas = document.createElement('canvas');
  const size = 10;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) return null;

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1.1;

  if (cigLevel === 'CIG1') {
    // Broken diagonal lines
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(3, 3);
    ctx.moveTo(5, 5);
    ctx.lineTo(10, 10);
    ctx.stroke();
  } else if (cigLevel === 'CIG2') {
    // Solid diagonal lines
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

const toRgbaColor = (color: string, alpha: number): string => {
  if (!color) {
    return `rgba(255,255,255,${alpha})`;
  }

  if (color.startsWith('rgba(') || color.startsWith('rgb(') || color.startsWith('hsl(') || color.startsWith('hsla(')) {
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

const buildStyle = (type: string, probability: string) => {
  const style = getFeatureStyle(type as any, probability);
  const fillColor = String(style.fillColor || '#999999');
  const strokeColor = String(style.color || '#000000');
  const fillOpacity = type === 'categorical'
    ? 1
    : (typeof style.fillOpacity === 'number' ? style.fillOpacity : 0.25);
  const strokeOpacity = typeof style.opacity === 'number' ? style.opacity : 1;
  const strokeWidth = style.weight || 2;
  const isCig = probability.startsWith('CIG');
  const styleZ = isCig
    // CIG overlays must always render above regular probabilities.
    // Within CIG, higher number gets higher priority (CIG3 > CIG2 > CIG1).
    ? 1000 + (parseInt(probability.replace('CIG', ''), 10) || 0)
    : computeZIndex(type as any, probability);

  return new Style({
    zIndex: styleZ,
    stroke: new Stroke({
      color: isCig ? '#111111' : toRgbaColor(strokeColor, strokeOpacity),
      width: isCig ? 1.2 : strokeWidth
    }),
    fill: isCig
      ? new Fill({ color: createHatchPattern(probability) as any || 'rgba(0,0,0,0)' })
      : new Fill({ color: toRgbaColor(fillColor, fillOpacity) })
  });
};

const OpenLayersVerificationMap = forwardRef<MapAdapterHandle<OLMap>, OpenLayersVerificationMapProps>(({ 
  activeOutlookType = 'categorical',
  selectedDay = 1
}, ref) => {
  const dispatch = useDispatch();
  const [showStylePicker, setShowStylePicker] = useState(false);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OLMap | null>(null);
  const tileLayerRef = useRef<TileLayer<OSM | XYZ> | null>(null);
  const landSourceRef = useRef<VectorSource>(new VectorSource());
  const landLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const vectorSourceRef = useRef<VectorSource>(new VectorSource());
  const outlookLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const stormReportsSourceRef = useRef<VectorSource>(new VectorSource()); // New source for storm reports
  const mapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const initialMapViewRef = useRef(mapView);
  const outlooks = useSelector((state: RootState) => selectVerificationOutlooksForDay(state, selectedDay));
  const baseMapStyle = useSelector((state: RootState) => state.overlays.baseMapStyle);
  const { reports, visible: reportsVisible, filterByType } = useSelector(
    (state: RootState) => state.stormReports
  ); // Select storm reports state

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

    const baseTileLayer = new TileLayer({ source: new OSM() });
    tileLayerRef.current = baseTileLayer;
    const landLayer = new VectorLayer({
      source: landSourceRef.current,
      visible: false,
      zIndex: 1,
    });
    landLayerRef.current = landLayer;
    const outlookLayer = new VectorLayer({ source: vectorSourceRef.current, zIndex: 3 });
    outlookLayerRef.current = outlookLayer;

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        baseTileLayer,
        landLayer,
        outlookLayer,
        new VectorLayer({
          source: stormReportsSourceRef.current,
          zIndex: 4,
          style: (feature) => buildReportStyle(feature.get('type') as ReportType),
        }),
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

  // Swap base tile source / blank land layer when style changes
  useEffect(() => {
    const tile = tileLayerRef.current;
    const land = landLayerRef.current;
    const el = mapElementRef.current;
    if (!tile || !land || !el) return;

    if (baseMapStyle === 'blank') {
      tile.setVisible(false);
      land.setVisible(true);
      el.style.backgroundColor = '#b8d4e8';

      if (landSourceRef.current.getFeatures().length === 0) {
        const loadStates = async () => {
          let geoData = cachedUsStatesGeoJSONVerif;
          if (!geoData) {
            const res = await fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json');
            geoData = await res.json();
            cachedUsStatesGeoJSONVerif = geoData;
          }
          const format = new GeoJSON();
          const features = format.readFeatures(geoData, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          });
          features.forEach((f) => {
            if ('setStyle' in f && typeof (f as any).setStyle === 'function') {
              (f as any).setStyle(BLANK_LAND_STYLE_VERIF);
            }
          });
          landSourceRef.current.addFeatures(features as any[]);
        };
        loadStates().catch(() => {});
      }
    } else {
      tile.setVisible(true);
      land.setVisible(false);
      el.style.backgroundColor = '';
      tile.setSource(createVerifTileSource(baseMapStyle as Exclude<BaseMapStyle, 'blank'>));
    }
  }, [baseMapStyle]);

  useEffect(() => {
    const outlookLayer = outlookLayerRef.current;
    if (!outlookLayer) {
      return;
    }

    // Match forecast map: categorical uses layer-level opacity so nested fills
    // don't compound differently than forecast rendering.
    outlookLayer.setOpacity(activeOutlookType === 'categorical' ? 0.5 : 1);
  }, [activeOutlookType]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    source.clear();

    const format = new GeoJSON();

    const sortedFeatures = [...activeFeatures].sort((a, b) => {
      return computeZIndex(activeOutlookType as any, a.probability) - computeZIndex(activeOutlookType as any, b.probability);
    });

    sortedFeatures.forEach(({ feature, probability }) => {
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

  useEffect(() => {
    const source = stormReportsSourceRef.current;
    source.clear();

    if (reportsVisible) {
      const filteredReports = reports.filter((report) => {
        if (!filterByType[report.type]) {
          return false;
        }

        // Probabilistic verification views should only show matching report type.
        // Categorical view keeps all report types visible.
        if (activeOutlookType === 'categorical') {
          return true;
        }

        return report.type === activeOutlookType;
      });

      filteredReports.forEach(report => {
        const geometry = new Point(fromLonLat([report.longitude, report.latitude]));
        const feature = new Feature({
          geometry,
          type: report.type, // Store type for styling
          reportId: report.id, // Store ID for potential future interactions
        });
        feature.setStyle(buildReportStyle(report.type));
        source.addFeature(feature);
      });
    }
  }, [reports, reportsVisible, filterByType, activeOutlookType]);

  return (
    <div className="forecast-map-container">
      <div ref={mapElementRef} style={{ width: '100%', height: '100%' }} />
      <div className="map-toolbar-bottom-right">
        <div className="flex items-center gap-1 rounded-md bg-white dark:bg-gray-800 p-1 shadow-md border border-gray-300 dark:border-gray-600">
          <div className="relative">
            <button
              type="button"
              className="map-toolbar-button"
              onClick={() => setShowStylePicker((v) => !v)}
              title="Base map style"
              aria-label="Base map style"
            >
              Map
            </button>
            {showStylePicker && (
              <div className="absolute bottom-full mb-2 right-0 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-lg p-2 flex flex-col gap-1 min-w-[120px] z-50">
                {([
                  { value: 'blank', label: 'Blank (Weather)' },
                  { value: 'osm', label: 'OpenStreetMap' },
                  { value: 'carto-light', label: 'Light' },
                  { value: 'carto-dark', label: 'Dark' },
                  { value: 'esri-satellite', label: 'Satellite' },
                ] as { value: BaseMapStyle; label: string }[]).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`text-left px-2 py-1 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${baseMapStyle === value ? 'font-bold bg-gray-100 dark:bg-gray-700' : ''}`}
                    onClick={() => {
                      dispatch(setBaseMapStyle(value));
                      setShowStylePicker(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <Legend activeOutlookType={activeOutlookType} />
      <UnofficialBadge />
    </div>
  );
});

OpenLayersVerificationMap.displayName = 'OpenLayersVerificationMap';

export default OpenLayersVerificationMap;
