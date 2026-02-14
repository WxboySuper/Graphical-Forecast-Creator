import React, { useEffect, useState } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';

const STATES_GEOJSON_URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

const SolidLegacyBaseLayer: React.FC = () => {
  const map = useMap();
  const [stateBordersData, setStateBordersData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    const container = map.getContainer();
    const previousBackground = container.style.backgroundColor;
    container.style.backgroundColor = '#7ea6d6';

    return () => {
      container.style.backgroundColor = previousBackground;
    };
  }, [map]);

  useEffect(() => {
    if (stateBordersData) {
      return;
    }

    fetch(STATES_GEOJSON_URL)
      .then((res) => res.json())
      .then((geoData: FeatureCollection) => setStateBordersData(geoData))
      .catch((err) => console.error('Error loading solid legacy base layer:', err));
  }, [stateBordersData]);

  if (!stateBordersData) {
    return null;
  }

  return (
    <GeoJSON
      key="solid-legacy-land"
      data={stateBordersData}
      style={{
        fillColor: '#f3efe2',
        fillOpacity: 1,
        color: '#4a4a4a',
        weight: 1,
        opacity: 0.9,
      }}
      interactive={false}
      pmIgnore={true}
    />
  );
};

export default SolidLegacyBaseLayer;