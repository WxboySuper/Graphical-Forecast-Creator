import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
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
import Legend from './Legend';

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

// Define a handle type that exposes the map instance
export type ForecastMapHandle = {
  getMap: () => L.Map | null;
};

// Helper component to sync map with Redux state and store map reference
const MapController: React.FC<{ setMapInstance: (map: L.Map) => void }> = ({ setMapInstance }) => {
  const { currentMapView } = useSelector((state: RootState) => state.forecast);
  const dispatch = useDispatch();
  const map = useMap();
  
  useEffect(() => {
    // Store map instance for export functionality
    setMapInstance(map);
    
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
  }, [map, dispatch, currentMapView, setMapInstance]);
  
  return null;
};

// Component to render the outlook polygons
const OutlookLayers: React.FC = () => {
  const dispatch = useDispatch();
  const { outlooks, drawingState } = useSelector((state: RootState) => state.forecast);
  const { activeOutlookType } = drawingState;

  // Helper function to sort probabilities to ensure proper layer order
  const sortProbabilities = (entries: [string, GeoJSON.Feature[]][]): [string, GeoJSON.Feature[]][] => {
    return entries.sort((a, b) => {
      const [probA, probB] = [a[0], b[0]];
      
      // Handle special cases first
      if (probA === 'TSTM') return -1;
      if (probB === 'TSTM') return 1;
      
      // Sort significant threats to the top
      const isSignificantA = probA.includes('#');
      const isSignificantB = probB.includes('#');
      if (isSignificantA !== isSignificantB) {
        return isSignificantA ? 1 : -1;
      }
      
      // For categorical risks, sort by severity
      const riskOrder: Record<string, number> = {
        'TSTM': 0, 'MRGL': 1, 'SLGT': 2, 'ENH': 3, 'MDT': 4, 'HIGH': 5
      };
      if (riskOrder[probA] !== undefined && riskOrder[probB] !== undefined) {
        return riskOrder[probA] - riskOrder[probB];
      }
      
      // For probabilistic outlooks, sort by percentage
      const getPercentValue = (prob: string) => parseInt(prob.replace(/[^0-9]/g, ''));
      return getPercentValue(probA) - getPercentValue(probB);
    });
  };
  
  // Get style for GeoJSON features
  const getFeatureStyle = (outlookType: OutlookType, probability: string) => {
    let color = '#FFFFFF';
    let zIndex = 400; // Base z-index for features
    
    // Determine color based on outlook type and probability
    switch (outlookType) {
      case 'categorical':
        color = colorMappings.categorical[probability as keyof typeof colorMappings.categorical] || '#FFFFFF';
        // Risk level based z-index ordering
        const riskOrder: Record<string, number> = {
          'TSTM': 0, 'MRGL': 1, 'SLGT': 2, 'ENH': 3, 'MDT': 4, 'HIGH': 5
        };
        zIndex += (riskOrder[probability] || 0) * 10;
        break;
      case 'tornado':
        color = colorMappings.tornado[probability as keyof typeof colorMappings.tornado] || '#FFFFFF';
        // Higher probabilities on top
        zIndex += parseInt(probability) || 0;
        break;
      case 'wind':
      case 'hail':
        color = colorMappings.wind[probability as keyof typeof colorMappings.wind] || '#FFFFFF';
        // Higher probabilities on top
        zIndex += parseInt(probability) || 0;
        break;
    }
    
    // Significant threats always on top of their respective risk level
    if (probability.includes('#')) {
      zIndex += 5;
    }
    
    return {
      color: color,
      weight: 2,
      opacity: 1,
      fillColor: color,
      fillOpacity: 0.6,
      zIndex // Add z-index for proper layering
    };
  };
  
  // Render features for an outlook type
  const renderOutlookFeatures = (outlookType: OutlookType) => {
    const entries = Array.from(outlooks[outlookType].entries());
    const sortedEntries = sortProbabilities(entries);
    
    return sortedEntries.map(([probability, features]) => (
      <FeatureGroup key={`${outlookType}-${probability}`}>
        {features.map(feature => (
          <GeoJSON
            key={feature.id as string}
            data={feature}
            style={() => getFeatureStyle(outlookType, probability)}
            className={probability.includes('#') ? 'significant-threat-pattern' : undefined}
            eventHandlers={{
              click: () => onFeatureClick(outlookType, probability, feature.id as string),
              mouseover: (e) => {
                const layer = e.target;
                layer.bindTooltip(`${outlookType.charAt(0).toUpperCase() + outlookType.slice(1)} Outlook
Risk Level: ${probability}${probability.includes('#') ? ' (Significant)' : ''}
Click to delete`, {
                  direction: 'top',
                  sticky: true,
                  opacity: 0.9,
                  className: 'feature-tooltip'
                }).openTooltip();
              }
            }}
          />
        ))}
      </FeatureGroup>
    ));
  };

  // Determine which layers to show based on active outlook type
  const shouldShowLayer = (outlookType: OutlookType) => {
    if (activeOutlookType === 'categorical') {
      return outlookType === 'categorical';
    }
    return outlookType !== 'categorical';
  };

  const onFeatureClick = (outlookType: OutlookType, probability: string, featureId: string) => {
    const outlookName = outlookType.charAt(0).toUpperCase() + outlookType.slice(1);
    const message = `Delete this ${outlookName} outlook area?\n\nRisk Level: ${probability}${
      probability.includes('#') ? ' (Significant)' : ''
    }`;
    
    if (window.confirm(message)) {
      dispatch(removeFeature({ outlookType, probability, featureId }));
    }
  };

  return (
    <>
      {Object.keys(outlooks).map(outlookType => (
        shouldShowLayer(outlookType as OutlookType) && (
          <React.Fragment key={outlookType}>
            {renderOutlookFeatures(outlookType as OutlookType)}
          </React.Fragment>
        )
      ))}
    </>
  );
};

const ForecastMap = forwardRef<ForecastMapHandle, {}>(({}, ref) => {
  const dispatch = useDispatch();
  const { drawingState } = useSelector((state: RootState) => state.forecast);
  const featureGroupRef = useRef<L.FeatureGroup>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  
  // Expose the map instance through the ref
  useImperativeHandle(ref, () => ({
    getMap: () => mapInstance
  }), [mapInstance]);
  
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

  // Handle keyboard navigation in drawing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mapInstance) return;

      // Don't handle keyboard events if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'Enter':
          // Complete the current shape when Enter is pressed
          const drawControl = featureGroupRef.current?._map?._toolbars?.draw;
          if (drawControl?._markers?.length >= 3) {
            drawControl._finishShape();
          }
          break;
        case 'Escape':
          // Cancel current drawing
          const activeDrawControl = featureGroupRef.current?._map?._toolbars?.draw?._activeShape;
          if (activeDrawControl) {
            activeDrawControl.deleteLastVertex();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mapInstance]);

  return (
    <div className="map-container">
      <MapContainer 
        center={[39.8283, -98.5795]} // Geographic center of the contiguous United States
        zoom={4} 
        style={{ height: '100%', width: '100%' }}
      >
        <MapController setMapInstance={setMapInstance} />
        
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
              rectangle: {
                shapeOptions: {
                  color: '#97009c',
                  fillOpacity: 0.6,
                  weight: 2
                },
                showArea: true
              },
              polygon: {
                allowIntersection: false,
                drawError: {
                  color: '#e1e100',
                  message: '<strong>Error:</strong> Shapes cannot intersect!'
                },
                shapeOptions: {
                  color: '#97009c',
                  fillOpacity: 0.6,
                  weight: 2
                },
                showArea: true,
                metric: true,
                repeatMode: false,
                guideLayers: []
              },
              circle: false,
              circlemarker: false,
              marker: false,
              polyline: false
            }}
            edit={{
              featureGroup: featureGroupRef.current as L.FeatureGroup,
              remove: false,
              edit: false
            }}
          />
          {/* Add accessible instructions for keyboard users */}
          <div className="sr-only" role="note" aria-live="polite">
            Press Enter to complete shape, Escape to cancel. 
            Use arrow keys to navigate the map while drawing.
          </div>
        </FeatureGroup>

        <Legend />
      </MapContainer>
    </div>
  );
});

// Set display name for better debugging
ForecastMap.displayName = 'ForecastMap';

export default ForecastMap;