import React, { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { selectVerificationOutlooksForDay } from '../../store/verificationSlice';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { colorMappings } from '../../utils/outlookUtils';
import { DayType } from '../../types/outlooks';
import Legend from './Legend';
import StormReportsLayer from './StormReportsLayer';
import './ForecastMap.css';

// Fix for Leaflet default icon issue in production
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Map Styles Configuration
const MAP_STYLES = [
  {
    name: 'Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  {
    name: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
  }
];

export interface VerificationMapHandle {
  getMap: () => L.Map | null;
}

interface VerificationMapProps {
  activeOutlookType?: 'categorical' | 'tornado' | 'wind' | 'hail';
  selectedDay?: DayType;
}

// Map controller to capture the map instance
const MapController: React.FC<{
  setMapInstance: (map: L.Map) => void;
}> = ({ setMapInstance }) => {
  const map = useMap();

  useEffect(() => {
    setMapInstance(map);
  }, [map, setMapInstance]);

  return null;
};

const VerificationMap = forwardRef<VerificationMapHandle, VerificationMapProps>(({ 
  activeOutlookType = 'categorical',
  selectedDay = 1
}, ref) => {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const outlooks = useSelector((state: RootState) => selectVerificationOutlooksForDay(state, selectedDay));
  const mapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);

  // Auto-select Dark map style when dark mode is enabled
  const defaultStyle = darkMode ? 'Dark' : 'Standard';

  useImperativeHandle(ref, () => ({
    getMap: () => mapInstance,
  }));

  const getColor = (type: string, probability: string, significant: boolean): string => {
    const typeColors = colorMappings[type as keyof typeof colorMappings];
    if (typeColors && typeof typeColors !== 'string') {
      const color = typeColors[probability as keyof typeof typeColors];
      if (color && typeof color === 'string') return color;
    }
    return '#999999'; // Default gray
  };

  const MapInner = () => {
    const outlook = outlooks[activeOutlookType];
    if (!outlook) return null;

    const allFeatures: Feature<Geometry, GeoJsonProperties>[] = [];
    for (const features of Array.from(outlook.values())) {
      allFeatures.push(...(features as Feature<Geometry, GeoJsonProperties>[]));
    }

    return (
      <>
        {allFeatures.map((feature, idx) => (
          <GeoJSON
            key={`${activeOutlookType}-${idx}-${feature.id}`}
            data={feature}
            style={() => ({
              color: getColor(
                activeOutlookType,
                feature.properties?.probability || '',
                feature.properties?.significant || false
              ),
              weight: 2,
              fillOpacity: 0.2,
            })}
          />
        ))}
        <StormReportsLayer />
      </>
    );
  };

  return (
    <div className="forecast-map-container">
      <MapContainer
        center={mapView.center}
        zoom={mapView.zoom}
        style={{ height: '100%', width: '100%' }}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        scrollWheelZoom={true}
        boxZoom={true}
        keyboard={true}
        zoomControl={true}
      >
        <MapController setMapInstance={setMapInstance} />
        <LayersControl position="topright">
          {MAP_STYLES.map((style) => (
            <LayersControl.BaseLayer checked={style.name === defaultStyle} name={style.name} key={style.name}>
              <TileLayer
                attribution={style.attribution}
                url={style.url}
              />
            </LayersControl.BaseLayer>
          ))}
        </LayersControl>
        <MapInner />
      </MapContainer>
      <Legend />
    </div>
  );
});

VerificationMap.displayName = 'VerificationMap';

export default VerificationMap;
