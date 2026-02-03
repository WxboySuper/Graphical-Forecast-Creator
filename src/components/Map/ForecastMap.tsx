// skipcq: JS-C1003
import * as React from 'react';
import type { Dispatch } from 'redux';
import { useDispatch, useSelector } from 'react-redux';
import { useState, useCallback } from 'react';

// Import Leaflet first, then Geoman to extend it
// skipcq: JS-C1003
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

// Now import react-leaflet components (they depend on L being ready)
import { MapContainer, TileLayer, FeatureGroup, useMap, LayersControl } from 'react-leaflet';
import { RootState } from '../../store';
import { addFeature, setMapView, removeFeature, selectCurrentOutlooks } from '../../store/forecastSlice';
import { OutlookType } from '../../types/outlooks';
import { sortProbabilities } from '../../utils/outlookUtils';
import { v4 as uuidv4 } from 'uuid';
import './ForecastMap.css';
import Legend from './Legend';
import MapOverlays from './MapOverlays';
import OutlookFeature from './OutlookFeature';
import { PMMap } from '../../types/map';
import ConfirmationModal from '../DrawingTools/ConfirmationModal';

// Need to manually set up Leaflet icon paths
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

// Define a handle type that exposes the map instance
export type ForecastMapHandle = {
  getMap: () => L.Map | null;
};

// Strongly-typed shapes for outlooks
type OutlooksMap = Record<OutlookType, Map<string, GeoJSON.Feature[]>>;

// Geoman helpers: add controls and options, and factories for event handlers
function addGeomanControls(pm: PMMap['pm']) {
  pm.addControls?.({
    position: 'topright',
    drawMarker: false,
    drawCircleMarker: false,
    drawPolyline: false,
    drawCircle: false,
    drawText: false,
    editMode: true,
    dragMode: true,
    rotateMode: false,
    removalMode: false,
    cutPolygon: false,
    drawPolygon: true,
    drawRectangle: true,
  });
}

function setGeomanGlobalOptions(pm: PMMap['pm']) {
  pm.setGlobalOptions?.({
    pathOptions: {
      color: '#97009c',
      fillColor: '#97009c',
      fillOpacity: 0.2,
      weight: 2,
    },
    snappable: true,
    snapDistance: 8,
    allowSelfIntersection: false,
  });
}

function makeHandleCreate(map: L.Map, onPolygonCreated: (layer: L.Layer, originalLayer?: L.Layer) => void) {
  return (e: L.LeafletEvent & { shape?: string; layer?: L.Layer }) => {
    const isPolygonShape = e.shape === 'Polygon' || e.shape === 'Rectangle';
      if (isPolygonShape && e.layer) {
      onPolygonCreated(e.layer);

      // Aggressively remove the temp layer
      try {
        map.removeLayer(e.layer);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Geoman] Failed to remove temp layer:', err);
      }
    }
  };
}

// Helper component to sync map with Redux state, store map reference, and initialize Geoman
const MapController: React.FC<{
  setMapInstance: (map: L.Map) => void;
  onPolygonCreated: (layer: L.Layer, originalLayer?: L.Layer) => void;
}> = ({ setMapInstance, onPolygonCreated }) => {
  const dispatch = useDispatch();
  const map = useMap();

  // Store map instance once on mount
  React.useEffect(() => {
    setMapInstance(map);
  }, [map, setMapInstance]);

  // Listen for user-initiated map moves (no Redux subscription needed)
  React.useEffect(() => {
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
  }, [map, dispatch]);

  // Initialize Geoman controls - runs once when map is ready
  React.useEffect(() => {
    // Narrowly typed guard for Geoman presence
    const pmMap = map as PMMap;
    if (!pmMap.pm) {
      // eslint-disable-next-line no-console
      console.error('[MapController] pmMap.pm is not available! Geoman not loaded.');
      return undefined;
    }

    // Apply controls and options via helpers
    addGeomanControls(pmMap.pm);
    setGeomanGlobalOptions(pmMap.pm);

    // Create handlers via factories (keeps logic small inside the effect)
    const handleCreate = makeHandleCreate(map, onPolygonCreated);

    // Listen on the map object directly (this is what works with Geoman)
    map.on('pm:create', handleCreate);

    // Cleanup function to remove event listeners
    return () => {
      map.off('pm:create', handleCreate);
    };
  }, [map, onPolygonCreated]);

  return null;
};

interface OutlookLayersProps {
  onRequestDelete: (outlookType: OutlookType, probability: string, featureId: string, message: React.ReactNode) => void;
}

const renderOutlookFeatures = (
  outlooks: OutlooksMap,
  dispatch: Dispatch,
  map: L.Map,
  activeOutlookType: OutlookType,
  onRequestDelete: OutlookLayersProps['onRequestDelete']
): React.ReactElement[] => {
  const shouldShowLayer = (outlookType: OutlookType) => {
    if (activeOutlookType === 'categorical') {
      return outlookType === 'categorical';
    }
    return outlookType === activeOutlookType;
  };

  return Object.keys(outlooks).flatMap(outlookType => {
    const validOutlookTypes = ['tornado', 'wind', 'hail', 'totalSevere', 'day4-8', 'categorical'];
    if (!validOutlookTypes.includes(outlookType)) return [];

    const ot = outlookType as OutlookType;
    if (!shouldShowLayer(ot)) return [];

    const entries = Array.from((outlooks[ot] as Map<string, GeoJSON.Feature[]>).entries());
    const sortedEntries = sortProbabilities(entries);

    return sortedEntries.map(([probability, features]) => (
      <FeatureGroup key={`${ot}-${probability}`}>
        {features.map(feature => (
          <OutlookFeature
            key={`${ot}-${probability}-${feature.id}`}
            feature={feature}
            outlookType={ot}
            probability={probability}
            dispatch={dispatch}
            map={map}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </FeatureGroup>
    ));
  });
};

// Now declare OutlookLayers (after helpers)
// Optimized: Memoized to prevent re-renders when map view or unrelated state changes
const OutlookLayers: React.FC<OutlookLayersProps> = React.memo(({ onRequestDelete }) => {
  const dispatch = useDispatch();
  const map = useMap();
  const outlooks = useSelector(selectCurrentOutlooks);
  const activeOutlookType = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);

  const elements = renderOutlookFeatures(outlooks as OutlooksMap, dispatch, map, activeOutlookType, onRequestDelete);

  if (elements.length === 0) return null;
  if (elements.length === 1) return elements[0];
  return React.createElement(React.Fragment, null, ...elements);
});

OutlookLayers.displayName = 'OutlookLayers';

interface MapInnerProps {
  darkMode: boolean;
  onRequestDelete: (outlookType: OutlookType, probability: string, featureId: string, message: React.ReactNode) => void;
}

// Extract deeper JSX children into a small component to reduce nesting
// Optimized: Memoized to prevent re-renders when parent re-renders
const MapInner: React.FC<MapInnerProps> = React.memo(({ darkMode, onRequestDelete }) => {
  // Auto-select Dark map style when dark mode is enabled
  const defaultStyle = darkMode ? 'Dark' : 'Standard';
  
  return (
    <>
      <LayersControl position="topright">
        {MAP_STYLES.map((style) => (
          <LayersControl.BaseLayer checked={style.name === defaultStyle} name={style.name} key={style.name}>
            <TileLayer
              attribution={style.attribution}
              url={style.url}
            />
          </LayersControl.BaseLayer>
        ))}
        
        <MapOverlays />
      </LayersControl>

    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        {/* CIG1: Broken diagonal - Bottom-left to top-right - Thinnest */}
        <pattern id="pattern-cig1" patternUnits="userSpaceOnUse" width="15" height="15">
          <path d="M0,15 L15,0" stroke="black" strokeWidth="1.5" strokeDasharray="6,3" />
        </pattern>

        {/* CIG2: Solid diagonal - Bottom-left to top-right (same direction as CIG1) - Medium */}
        <pattern id="pattern-cig2" patternUnits="userSpaceOnUse" width="15" height="15">
           <path d="M0,15 L15,0" stroke="black" strokeWidth="2" />
        </pattern>

        {/* CIG3: Crosshatch - Both diagonal directions - Thickest */}
        <pattern id="pattern-cig3" patternUnits="userSpaceOnUse" width="15" height="15">
          <path d="M0,15 L15,0" stroke="black" strokeWidth="2.5" />
          <path d="M0,0 L15,15" stroke="black" strokeWidth="2.5" />
        </pattern>
        
        {/* Legacy Pattern for backward compatibility */}
        <pattern id="hatchPattern" patternUnits="userSpaceOnUse" width="15" height="15">
          <path d="M0,15 L15,0 M0,0 L15,15" stroke="black" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>

    <OutlookLayers onRequestDelete={onRequestDelete} />

      <Legend />
    </>
  );
});

MapInner.displayName = 'MapInner';

// Geoman layer interface
interface GeomanLayer extends L.Layer {
  toGeoJSON(): GeoJSON.Feature;
}

const ForecastMap = React.forwardRef<ForecastMapHandle>((_, ref) => {
  const dispatch = useDispatch();
  // Optimized: Select only drawingState to avoid re-rendering on other forecast changes (like map view)
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const [mapInstance, setMapInstance] = React.useState<L.Map | null>(null);
  const [featureToDelete, setFeatureToDelete] = useState<{
    outlookType: OutlookType;
    probability: string;
    featureId: string;
    message: React.ReactNode;
  } | null>(null);
  
  // Store drawingState in a ref so our callback always has latest values
  const drawingStateRef = React.useRef(drawingState);
  React.useEffect(() => {
    drawingStateRef.current = drawingState;
  }, [drawingState]);
  
  // Expose the map instance through the ref
  React.useImperativeHandle(ref, () => ({
    getMap: () => mapInstance
  }), [mapInstance]);
  
  // Drawing creation handler for Geoman
  const handlePolygonCreated = React.useCallback((layer: L.Layer, originalLayer?: L.Layer) => {
    const geomanLayer = layer as GeomanLayer;

    // Convert to GeoJSON
    const geoJson = geomanLayer.toGeoJSON();
    
    // Get current drawing state from ref
    const currentDrawingState = drawingStateRef.current;

    if (originalLayer) {
      // If originalLayer exists, this is a cut/edit operation resulting in a new shape
      // We need to remove the original and add the new one, inheriting properties
      const originalGeoJson = (originalLayer as GeomanLayer).toGeoJSON();
      const originalId = originalGeoJson.id as string;
      const originalType = originalGeoJson.properties?.outlookType as OutlookType;
      const originalProb = originalGeoJson.properties?.probability as string;

      if (originalId && originalType && originalProb) {
        dispatch(removeFeature({ outlookType: originalType, probability: originalProb, featureId: originalId }));
      }
      
      // Inherit properties
      geoJson.properties = {
        ...geoJson.properties,
        ...originalGeoJson.properties
      };
      
      // Assign new ID for the new shape
      geoJson.id = uuidv4();
    } else {
      // Completely new drawing
      geoJson.id = uuidv4();

      // Add metadata about the outlook type
      geoJson.properties = {
        ...geoJson.properties,
        outlookType: currentDrawingState.activeOutlookType,
        probability: currentDrawingState.activeProbability,
        isSignificant: currentDrawingState.isSignificant
      };
    }
    
    // Dispatch to store
    dispatch(addFeature({ feature: geoJson }));
  }, [dispatch]);

  const handleRequestDelete = useCallback((outlookType: OutlookType, probability: string, featureId: string, message: React.ReactNode) => {
    setFeatureToDelete({ outlookType, probability, featureId, message });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (featureToDelete) {
      dispatch(removeFeature({
        outlookType: featureToDelete.outlookType,
        probability: featureToDelete.probability,
        featureId: featureToDelete.featureId
      }));
      setFeatureToDelete(null);
    }
  }, [dispatch, featureToDelete]);

  const handleCancelDelete = useCallback(() => {
    setFeatureToDelete(null);
  }, []);

  // Handle keyboard shortcuts for drawing
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mapInstance) return;

      // Don't handle keyboard events if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'Escape': {
          // Cancel current drawing mode
          // Narrowly typed guard for Geoman `pm` to avoid `any`
          if (!mapInstance) return;
          const gmMap = mapInstance as any;
          if (gmMap.pm && typeof gmMap.pm.disableDraw === 'function') {
            gmMap.pm.disableDraw();
          }
          break;
        }
        default:
          // Do nothing for other keys
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
          <MapController
            setMapInstance={setMapInstance}
            onPolygonCreated={handlePolygonCreated}
          />

          <MapInner darkMode={darkMode} onRequestDelete={handleRequestDelete} />
      </MapContainer>

      <ConfirmationModal
        isOpen={!!featureToDelete}
        title="Confirm Deletion"
        message={featureToDelete?.message}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
});

// Set display name for better debugging
ForecastMap.displayName = 'ForecastMap';

export default ForecastMap;
