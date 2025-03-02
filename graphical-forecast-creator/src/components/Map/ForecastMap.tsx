import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { MapContainer, TileLayer, FeatureGroup, useMap, GeoJSON } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { RootState } from '../../store';
import { addFeature, setMapView, removeFeature } from '../../store/forecastSlice';
import { OutlookType } from '../../types/outlooks';
import { colorMappings } from '../../utils/outlookUtils';
import { v4 as uuidv4 } from 'uuid';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import './ForecastMap.css';

// Need to manually set up Leaflet icon paths
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix for Leaflet default icon issue in production
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Helper component to sync map with Redux state
const MapController: React.FC = () => {
  const { currentMapView } = useSelector((state: RootState) => state.forecast);
  const dispatch = useDispatch();
  const map = useMap();
  
  useEffect(() => {
    map.setView(currentMapView.center, currentMapView.zoom);
    
    const onMoveEnd = () => {
      const center = map.getCenter();
      dispatch(setMapView({
        center: [center.lat, center.lng],
        zoom: map.getZoom()
      }));
    };
    
    map.on('moveend', onMoveEnd);
    
    return () => {
      map.off('moveend', onMoveEnd);
    };
  }, [map, dispatch, currentMapView]);
  
  return null;
};

// Component to render the outlook polygons
const OutlookLayers: React.FC = () => {
  const dispatch = useDispatch();
  const { outlooks, drawingState } = useSelector((state: RootState) => state.forecast);
  const { activeOutlookType } = drawingState;
  
  // Create a style function for GeoJSON features
  const getFeatureStyle = (outlookType: OutlookType, probability: string) => {
    let color = '#FFFFFF';
    const isSignificant = probability.includes('#');
    
    // Get color based on outlook type and probability
    switch (outlookType) {
      case 'tornado':
        color = colorMappings.tornado[probability as keyof typeof colorMappings.tornado] || '#FFFFFF';
        break;
      case 'wind':
      case 'hail':
        color = colorMappings.wind[probability as keyof typeof colorMappings.wind] || '#FFFFFF';
        break;
      case 'categorical':
        color = colorMappings.categorical[probability as keyof typeof colorMappings.categorical] || '#FFFFFF';
        break;
    }
    
    return {
      color: color,
      weight: 2,
      opacity: 1,
      fillColor: color,
      fillOpacity: 0.6,
      // Add a pattern fill for significant threats
      fillPattern: isSignificant ? L.pattern({
        patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(45)',
        width: 10,
        height: 10,
        patternContentUnits: 'userSpaceOnUse',
        pattern: `<rect width="2" height="10" fill="black" opacity="0.7" x="0" y="0" />`
      }) : undefined
    };
  };
  
  // Handle click on a polygon for deletion
  const onFeatureClick = (outlookType: OutlookType, probability: string, featureId: string) => {
    if (window.confirm('Do you want to delete this outlook area?')) {
      dispatch(removeFeature({ outlookType, probability, featureId }));
    }
  };
  
  // Render all outlook types with their probabilities
  return (
    <>
      {(Object.keys(outlooks) as OutlookType[]).map(outlookType => (
        <React.Fragment key={outlookType}>
          {Array.from(outlooks[outlookType].entries()).map(([probability, features]) => (
            <FeatureGroup key={`${outlookType}-${probability}`}>
              {features.map(feature => (
                <GeoJSON
                  key={feature.id as string}
                  data={feature}
                  style={() => getFeatureStyle(outlookType, probability)}
                  eventHandlers={{
                    click: () => onFeatureClick(outlookType, probability, feature.id as string)
                  }}
                />
              ))}
            </FeatureGroup>
          ))}
        </React.Fragment>
      ))}
    </>
  );
};

const ForecastMap: React.FC = () => {
  const dispatch = useDispatch();
  const { drawingState } = useSelector((state: RootState) => state.forecast);
  const featureGroupRef = useRef<L.FeatureGroup>(null);
  
  // Drawing creation handler
  const handleCreated = (e: any) => {
    const { layerType, layer } = e;
    
    // Only handle polygons for now
    if (layerType === 'polygon' || layerType === 'rectangle') {
      // Convert to GeoJSON
      const geoJson = layer.toGeoJSON();
      // Add a unique ID
      geoJson.id = uuidv4();
      
      // Add metadata about the outlook type
      geoJson.properties = {
        ...geoJson.properties,
        outlookType: drawingState.activeOutlookType,
        probability: drawingState.activeProbability,
        isSignificant: drawingState.isSignificant
      };
      
      // Dispatch to store
      dispatch(addFeature({ feature: geoJson }));
      
      // Remove the layer from the draw layer since we're managing it in our state
      featureGroupRef.current?.removeLayer(layer);
    }
  };

  return (
    <div className="map-container">
      <MapContainer 
        center={[39.8283, -98.5795]} // Geographic center of the contiguous United States
        zoom={4} 
        style={{ height: '100%', width: '100%' }}
      >
        <MapController />
        
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Display existing outlook layers */}
        <OutlookLayers />
        
        {/* Drawing layer */}
        <FeatureGroup ref={featureGroupRef}>
          <EditControl
            position="topright"
            onCreated={handleCreated}
            draw={{
              rectangle: true,
              polygon: {
                allowIntersection: false,
                drawError: {
                  color: '#e1e100',
                  message: '<strong>Error:</strong> Shapes cannot intersect!'
                },
                shapeOptions: {
                  color: '#97009c'
                }
              },
              circle: false,
              circlemarker: false,
              marker: false,
              polyline: false
            }}
            edit={{
              featureGroup: featureGroupRef.current as L.FeatureGroup,
              remove: false, // We handle deletion through our own click handler
              edit: false // We don't support editing for now
            }}
          />
        </FeatureGroup>
      </MapContainer>
    </div>
  );
};

export default ForecastMap;