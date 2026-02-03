// skipcq: JS-C1003
import * as React from 'react';
import type { Dispatch } from 'redux';
import { useDispatch, useSelector } from 'react-redux';

// Import Leaflet first, then Geoman to extend it
// skipcq: JS-C1003
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

// Now import react-leaflet components (they depend on L being ready)
import { MapContainer, TileLayer, FeatureGroup, useMap, GeoJSON } from 'react-leaflet';
import { RootState } from '../../store';
import { addFeature, setMapView } from '../../store/forecastSlice';
import { OutlookType } from '../../types/outlooks';
import { sortProbabilities } from '../../utils/outlookUtils';
import { v4 as uuidv4 } from 'uuid';
import './ForecastMap.css';
import Legend from './Legend';
import OutlookFeature from './OutlookFeature';
import { PMMap } from '../../types/map';

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
    editMode: false,
    dragMode: false,
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
      fillOpacity: 0.6,
      weight: 2,
    },
    snappable: true,
    snapDistance: 20,
    allowSelfIntersection: false,
  });
}

function makeHandleCreate(map: L.Map, onPolygonCreated: (layer: L.Layer) => void) {
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
  onPolygonCreated: (layer: L.Layer) => void;
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

// Interface for context needed to render outlooks (consolidates arguments)
interface OutlookRenderContext {
  dispatch: Dispatch;
  map: L.Map;
  activeOutlookType: OutlookType;
}

const renderOutlookFeatures = (
  outlooks: OutlooksMap,
  context: OutlookRenderContext
): React.ReactElement[] => {
  const { activeOutlookType } = context;

  const shouldShowLayer = (outlookType: OutlookType) => {
    if (activeOutlookType === 'categorical') {
      return outlookType === 'categorical';
    }
    return outlookType === activeOutlookType;
  };

  return Object.keys(outlooks).flatMap(outlookType => {
    const validOutlookTypes = ['tornado', 'wind', 'hail', 'categorical'];
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
            dispatch={context.dispatch}
            map={context.map}
          />
        ))}
      </FeatureGroup>
    ));
  });
};

// Now declare OutlookLayers (after helpers)
// Optimized: Memoized to prevent re-renders when map view or unrelated state changes
const OutlookLayers: React.FC = React.memo(() => {
  const dispatch = useDispatch();
  const map = useMap();
  const outlooks = useSelector((state: RootState) => state.forecast.outlooks);
  const activeOutlookType = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);

  const context: OutlookRenderContext = {
    dispatch,
    map,
    activeOutlookType
  };

  const elements = renderOutlookFeatures(outlooks as OutlooksMap, context);

  if (elements.length === 0) return null;
  if (elements.length === 1) return elements[0];
  return React.createElement(React.Fragment, null, ...elements);
});

OutlookLayers.displayName = 'OutlookLayers';

// Extract deeper JSX children into a small component to reduce nesting
// Optimized: Memoized to prevent re-renders when parent re-renders
const MapInner: React.FC = React.memo(() => (
  <>
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />

    <svg>
      <defs>
        <pattern id="hatchPattern" patternUnits="userSpaceOnUse" width="10" height="10">
          <path d="M0,0 L10,10 M10,0 L0,10" stroke="black" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>

    <OutlookLayers />

    <Legend />
  </>
));

MapInner.displayName = 'MapInner';

// Geoman layer interface
interface GeomanLayer extends L.Layer {
  toGeoJSON(): GeoJSON.Feature;
}

const ForecastMap = React.forwardRef<ForecastMapHandle>((_, ref) => {
  const dispatch = useDispatch();
  // Optimized: Select only drawingState to avoid re-rendering on other forecast changes (like map view)
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const [mapInstance, setMapInstance] = React.useState<L.Map | null>(null);
  
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
  const handlePolygonCreated = React.useCallback((layer: L.Layer) => {
    const geomanLayer = layer as GeomanLayer;

    // Convert to GeoJSON
    const geoJson = geomanLayer.toGeoJSON();
    // Add a unique ID
    geoJson.id = uuidv4();

    // Get current drawing state from ref
    const currentDrawingState = drawingStateRef.current;

    // Add metadata about the outlook type
    geoJson.properties = {
      ...geoJson.properties,
      outlookType: currentDrawingState.activeOutlookType,
      probability: currentDrawingState.activeProbability,
      isSignificant: currentDrawingState.isSignificant
    };
    
    // Dispatch to store
    dispatch(addFeature({ feature: geoJson }));
  }, [dispatch]);

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
          const gmMap = mapInstance as PMMap;
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

          <MapInner />
      </MapContainer>
    </div>
  );
});

// Set display name for better debugging
ForecastMap.displayName = 'ForecastMap';

export default ForecastMap;
