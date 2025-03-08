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
    let fillColor = '#FFFFFF';
    let fillOpacity = 0.6;
    let zIndex = 400; // Base z-index for features
    
    // Determine color based on outlook type and probability
    switch (outlookType) {
      case 'categorical':
        color = colorMappings.categorical[probability as keyof typeof colorMappings.categorical] || '#FFFFFF';
        fillColor = color; // Set fillColor to the same as color
        // Risk level based z-index ordering
        const riskOrder: Record<string, number> = {
          'TSTM': 0, 'MRGL': 1, 'SLGT': 2, 'ENH': 3, 'MDT': 4, 'HIGH': 5
        };
        zIndex += (riskOrder[probability] || 0) * 10;
        break;
      case 'tornado':
        color = colorMappings.tornado[probability as keyof typeof colorMappings.tornado] || '#FFFFFF';
        fillColor = color; // Set fillColor to the same as color
        // Higher probabilities on top
        zIndex += parseInt(probability) || 0;
        break;
      case 'wind':
      case 'hail':
        color = colorMappings.wind[probability as keyof typeof colorMappings.wind] || '#FFFFFF';
        fillColor = color; // Set fillColor to the same as color
        // Higher probabilities on top
        zIndex += parseInt(probability) || 0;
        break;
    }
    
    // Significant threats always on top of their respective risk level
    if (probability.includes('#')) {
      zIndex += 5;
      fillColor = 'url(#hatchPattern)'; // Apply hatch pattern
      fillOpacity = 1; // Ensure hatch pattern is fully visible
      color = 'transparent'; // Remove the border color for significant threats
    }
    
    return {
      color: color,
      weight: 2,
      opacity: 1,
      fillColor: fillColor,
      fillOpacity: fillOpacity,
      zIndex, // Add z-index for proper layering
      className: probability.includes('#') ? 'significant-threat-pattern' : undefined
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
    // Only show the active outlook type, except when in categorical view
    if (activeOutlookType === 'categorical') {
      // In categorical view, only show categorical layers
      return outlookType === 'categorical';
    } else {
      // In specific outlook views (tornado, wind, hail), only show that specific outlook's layers
      return outlookType === activeOutlookType;
    }
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

// Define types for Leaflet Draw controls
interface LeafletDrawLayer extends L.Layer {
  toGeoJSON(): GeoJSON.Feature;
  _latlngs?: L.LatLng[];
  options: L.PathOptions & {
    className?: string;
  };
}

interface LeafletCreateEvent {
  layer: LeafletDrawLayer;
  layerType: 'polygon' | 'rectangle';
}

const ForecastMap = forwardRef<ForecastMapHandle>((_, ref) => {
  const dispatch = useDispatch();
  const { drawingState } = useSelector((state: RootState) => state.forecast);
  const featureGroupRef = useRef<L.FeatureGroup>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  
  // Expose the map instance through the ref
  useImperativeHandle(ref, () => ({
    getMap: () => mapInstance
  }), [mapInstance]);
  
  // Drawing creation handler
  const handleCreated = (e: { layerType: string; layer: L.Layer }) => {
    const { layerType, layer } = e as LeafletCreateEvent;
    
    // Only handle polygons for now
    if (layerType === 'polygon' || layerType === 'rectangle') {
      // Get the layer's coordinates in the correct CRS
      const geoJson = (layer as L.Polygon).toGeoJSON();
      
      // Ensure coordinates are in proper bounds
      if (geoJson.type === 'Feature' && geoJson.geometry.type === 'Polygon') {
        // Normalize coordinates to ensure they're within valid bounds
        geoJson.geometry.coordinates = geoJson.geometry.coordinates.map(ring =>
          ring.map(coord => [
            // Ensure longitude is between -180 and 180
            ((coord[0] + 180) % 360 + 360) % 360 - 180,
            // Ensure latitude is between -90 and 90
            Math.max(-90, Math.min(90, coord[1]))
          ])
        );
      }

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

      // Get the current draw handler if any
      const drawHandler = (featureGroupRef.current as any)?._map?._toolbars?.draw;
      if (!drawHandler) return;

      switch (e.key) {
        case 'Enter':
          // Complete the current shape when Enter is pressed
          if (drawHandler._markers?.length >= 3) {
            drawHandler._finishShape?.();
          }
          break;
        case 'Escape':
          // Cancel current drawing
          drawHandler._activeShape?.deleteLastVertex?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mapInstance]);

  return (
    <div className="map-container">
      <MapContainer 
        center={[39.8283, -98.5795]}
        zoom={4} 
        style={{ height: '100%', width: '100%' }}
      >
        <MapController setMapInstance={setMapInstance} />
        
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <pattern 
              id="hatchPattern" 
              patternUnits="userSpaceOnUse" 
              width="10" 
              height="10"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="10" stroke="black" strokeWidth="2" />
              <line x1="10" y1="0" x2="10" y2="10" stroke="black" strokeWidth="2" />
            </pattern>
          </defs>
        </svg>
        
        <OutlookLayers />
        
        <FeatureGroup ref={featureGroupRef}>
          {/* @ts-ignore - Types aren't perfect but functionality works */}
          <EditControl
            position="topright"
            onCreated={handleCreated}
            draw={{
              rectangle: {
                shapeOptions: {
                  color: '#97009c',
                  fillOpacity: 0.6,
                  weight: 2
                }
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
                repeatMode: false
              },
              circle: false,
              circlemarker: false,
              marker: false,
              polyline: false
            }}
            edit={{
              featureGroup: featureGroupRef.current || undefined,
              remove: false,
              edit: false
            }}
          />
        </FeatureGroup>

        <Legend />
      </MapContainer>
    </div>
  );
});

// Set display name for better debugging
ForecastMap.displayName = 'ForecastMap';

export default ForecastMap;