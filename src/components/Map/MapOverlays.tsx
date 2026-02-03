import React, { useEffect, useState } from 'react';
import { GeoJSON, LayersControl } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';

// Component for State Borders overlay
const StateBordersOverlay: React.FC = () => {
  const [stateBordersData, setStateBordersData] = useState<FeatureCollection | null>(null);
  
  useEffect(() => {
    if (!stateBordersData) {
      fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
        .then((res) => res.json())
        .then((geoData) => setStateBordersData(geoData))
        .catch((err) => console.error('Error loading state borders:', err));
    }
  }, [stateBordersData]);
  
  if (!stateBordersData) return null;
  
  return (
    <GeoJSON
      key="state-borders"
      data={stateBordersData}
      style={{
        color: '#333333',
        weight: 2,
        fillOpacity: 0,
        opacity: 0.7,
      }}
      interactive={false}
      pmIgnore={true}
    />
  );
};

// Component for Counties overlay
const CountiesOverlay: React.FC = () => {
  const [countiesData, setCountiesData] = useState<FeatureCollection | null>(null);
  
  useEffect(() => {
    if (!countiesData) {
      fetch('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json')
        .then((res) => res.json())
        .then((geoData) => setCountiesData(geoData))
        .catch((err) => console.error('Error loading counties:', err));
    }
  }, [countiesData]);
  
  if (!countiesData) return null;
  
  return (
    <GeoJSON
      key="counties"
      data={countiesData}
      style={{
        color: '#666666',
        weight: 0.5,
        fillOpacity: 0,
        opacity: 0.4,
      }}
      interactive={false}
      pmIgnore={true}
    />
  );
};

const MapOverlays: React.FC = () => {
  return (
    <>
      <LayersControl.Overlay checked name="State Borders">
        <StateBordersOverlay />
      </LayersControl.Overlay>
      
      <LayersControl.Overlay name="Counties">
        <CountiesOverlay />
      </LayersControl.Overlay>
    </>
  );
};

export default MapOverlays;
