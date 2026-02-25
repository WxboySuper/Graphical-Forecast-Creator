import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
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
import type { BaseMapStyle } from '../../store/overlaysSlice';
import { colorMappings } from '../../utils/outlookUtils';
import { DayType } from '../../types/outlooks';
import type { MapAdapterHandle } from '../../maps/contracts';
import type { Feature as GeoJsonFeature } from 'geojson';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Circle, Fill as StyleFill, Stroke as StyleStroke, Style as OlStyle } from 'ol/style';
import Legend from './Legend';
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
  const tileLayerRef = useRef<TileLayer<OSM | XYZ> | null>(null);
  const landSourceRef = useRef<VectorSource>(new VectorSource());
  const landLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const vectorSourceRef = useRef<VectorSource>(new VectorSource());
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

    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        baseTileLayer,
        landLayer,
        new VectorLayer({ source: vectorSourceRef.current }),
        new VectorLayer({
          source: stormReportsSourceRef.current,
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

  useEffect(() => {
    const source = stormReportsSourceRef.current;
    source.clear();

    if (reportsVisible) {
      const filteredReports = reports.filter(report => filterByType[report.type]);

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
  }, [reports, reportsVisible, filterByType]);

  return (
    <div className="forecast-map-container">
      <div ref={mapElementRef} style={{ width: '100%', height: '100%' }} />
      <Legend />
    </div>
  );
});

OpenLayersVerificationMap.displayName = 'OpenLayersVerificationMap';

export default OpenLayersVerificationMap;
