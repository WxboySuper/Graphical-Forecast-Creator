import React, { memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Dispatch } from 'redux';
import { useDispatch, useSelector } from 'react-redux';

// Import Leaflet first, then Geoman to extend it
import L, { LeafletEvent, Layer, Path, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

// Now import react-leaflet components (they depend on L being ready)
import { MapContainer, TileLayer, FeatureGroup, useMap, GeoJSON, LayersControl } from 'react-leaflet';
import { RootState } from '../../store';
import { addFeature, setMapView, removeFeature, updateFeature, selectCurrentOutlooks, toggleLowProbability } from '../../store/forecastSlice';
import { OutlookType } from '../../types/outlooks';
import { createTooltipContent, stripHtml } from '../../utils/domUtils';
import { getFeatureStyle, sortProbabilities } from '../../utils/mapStyleUtils';
import { v4 as uuidv4 } from 'uuid';
import './ForecastMap.css';
import Legend from './Legend';
import MapOverlays from './MapOverlays';
import StatusOverlay from './StatusOverlay';
import ConfirmationModal from '../DrawingTools/ConfirmationModal';
import DeleteConfirmation from './DeleteConfirmation';
import { useOutlookLayersState } from './useOutlookLayersState';

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
  },
  {
    name: 'Simple (SPC-Style)',
    url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }
];

// Define a handle type that exposes the map instance
export type ForecastMapHandle = {
  getMap: () => L.Map | null;
};

// Narrow type for Leaflet map with Geoman `pm` helpers (used in MapController)
type PMMap = L.Map & {
  pm?: {
    addControls?: (opts: Record<string, unknown>) => void;
    setGlobalOptions?: (opts: Record<string, unknown>) => void;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    globalDrawModeEnabled?: () => boolean;
  };
};

// Strongly-typed shapes for outlooks and feature style objects
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
  useEffect(() => {
    setMapInstance(map);
  }, [map, setMapInstance]);

  // Listen for user-initiated map moves (no Redux subscription needed)
  useEffect(() => {
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
  useEffect(() => {
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

// Helper to check if drawing mode is active (safe with optional chaining)
const isDrawingMode = (map: L.Map): boolean => {
  const pmMap = map as PMMap;
  return Boolean(pmMap.pm?.globalDrawModeEnabled?.());
};

// Interface for context needed to render outlooks (consolidates arguments)
interface OutlookRenderContext {
  dispatch: Dispatch;
  map: L.Map;
  activeOutlookType: OutlookType;
  styleFn: (o: OutlookType, p: string) => FeatureStyle;
  onRequestDelete: (outlookType: OutlookType, probability: string, featureId: string) => void;
}

const createFeatureHandlersFactory = (context: OutlookRenderContext) => (outlookType: OutlookType, probability: string, featureId: string) => {
  const { dispatch, map, onRequestDelete } = context;

  const handleClick = () => {
    // Check if drawing is active to prevent accidental deletion when clicking inside an existing polygon
    if (isDrawingMode(map)) {
      return;
    }

    onRequestDelete(outlookType, probability, featureId);
  };

  const handleMouseOver = (e: LeafletEvent) => {
    const layer = e.target as Layer;
    const tooltipContent = createTooltipContent(outlookType, probability);

    if ('bindTooltip' in layer && typeof layer.bindTooltip === 'function') {
      layer.bindTooltip(tooltipContent, {
        direction: 'top',
        sticky: true,
        opacity: 0.9,
        className: 'feature-tooltip'
      }).openTooltip();
    }
  };
  
  const handleEdit = (e: LeafletEvent) => {
    const layer = e.target as GeomanLayer;
    const geoJson = layer.toGeoJSON();
    geoJson.id = featureId;
    dispatch(updateFeature({ feature: geoJson }));
  };

  const handleRemove = () => {
    dispatch(removeFeature({ outlookType, probability, featureId }));
  };

  return {
    click: handleClick,
    mouseover: handleMouseOver,
    'pm:edit': handleEdit,
    'pm:dragend': handleEdit,
    'pm:markerdragend': handleEdit,
    'pm:remove': handleRemove
  };
};

// Create an onEachFeature factory that forces the Leaflet layer style and attaches handlers
function createOnEachFeature(
  styleObj: FeatureStyle,
  handlers: Record<string, (e: LeafletEvent) => void>
) {
  return function onEach(feature: GeoJSON.Feature, layer: Layer) {
    // Force the style on the created layer (in case global Geoman styles persist)
    const layerWithStyle = layer as Path & { setStyle?: (opts: L.PathOptions) => void };
    if (typeof layerWithStyle.setStyle === 'function') {
      try {
        layerWithStyle.setStyle(styleObj as L.PathOptions);
      } catch {
        // ignore
      }
    }

    // Also force underlying SVG attributes if available to override external styles
    try {
      const layerWithPath = layer as Layer & { _path?: SVGElement };
      const pathEl = layerWithPath._path;
      if (pathEl) {
        const fc = styleObj.fillColor;
        if (typeof fc === 'string' && !fc.startsWith('url(')) {
          pathEl.setAttribute('fill', fc);
        } else if (typeof fc === 'string' && fc.startsWith('url(')) {
             pathEl.setAttribute('fill', fc);
        }
        
        pathEl.setAttribute('fill-opacity', String(styleObj.fillOpacity ?? 1));
        if (styleObj.color) pathEl.setAttribute('stroke', String(styleObj.color));
        pathEl.setAttribute('stroke-width', String(styleObj.weight ?? 1));
        
        // Fix for pointer-events on transparent overlay
        if (styleObj.interactive === false) {
             pathEl.setAttribute('pointer-events', 'none');
        }
      }
    } catch {
      // ignore DOM write errors in server env
    }

    // Attach event handlers directly to the layer to ensure they bind
    const layerWithOn = layer as Layer & { on?: (event: string, fn: (...args: unknown[]) => void) => void };
    try {
      Object.entries(handlers).forEach(([evt, fn]) => {
        if (typeof layerWithOn.on === 'function') {
          layerWithOn.on(evt, fn as (...args: unknown[]) => void);
        }
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[onEachFeature] Failed to attach handlers:', err);
    }
  };
}

const renderOutlookFeatures = (
  outlooks: OutlooksMap,
  context: OutlookRenderContext
): React.ReactElement[] => {
  const { activeOutlookType, styleFn } = context;

  const shouldShowLayer = (outlookType: OutlookType) => {
    if (activeOutlookType === 'categorical') {
      return outlookType === 'categorical';
    }
    return outlookType === activeOutlookType;
  };

  const handlerFactory = createFeatureHandlersFactory(context);

  return Object.keys(outlooks).flatMap(outlookType => {
    const validOutlookTypes = ['tornado', 'wind', 'hail', 'categorical'];
    if (!validOutlookTypes.includes(outlookType)) return [];

    const ot = outlookType as OutlookType;
    if (!shouldShowLayer(ot)) return [];

    const entries = Array.from((outlooks[ot] as Map<string, GeoJSON.Feature[]>).entries());
    const sortedEntries = sortProbabilities(entries);

    return sortedEntries.map(([probability, features]) => (
      <FeatureGroup key={`${ot}-${probability}`}>
        {features.map(feature => {
          const fid = feature.id as string;
          const handlers = handlerFactory(ot, probability, fid);
          
          const styleObj = styleFn(ot, probability);
          const onEach = createOnEachFeature(styleObj, handlers as Record<string, (e: LeafletEvent) => void>);
          
          return (
            <GeoJSON
              key={`${ot}-${probability}-${fid}`}
              data={feature}
              pathOptions={styleObj as L.PathOptions}
              onEachFeature={onEach}
            />
          );
        })}
      </FeatureGroup>
    ));
  });
};

// Now declare OutlookLayers (after helpers)
// Optimized: Memoized to prevent re-renders when map view or unrelated state changes
const OutlookLayers: React.FC = memo(() => {
  const dispatch = useDispatch();
  const map = useMap();
  const outlooks = useSelector(selectCurrentOutlooks);
  const activeOutlookType = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);

  const { 
    deleteModal, 
    handleRequestDelete, 
    handleConfirmDelete, 
    handleCancelDelete 
  } = useOutlookLayersState();

  const context: OutlookRenderContext = {
    dispatch,
    map,
    activeOutlookType,
    styleFn: getFeatureStyle,
    onRequestDelete: handleRequestDelete
  };

  const elements = renderOutlookFeatures(outlooks as OutlooksMap, context);

  return (
    <>
      {elements}
      <DeleteConfirmation 
        modalState={deleteModal} 
        onConfirm={handleConfirmDelete} 
        onCancel={handleCancelDelete} 
      />
    </>
  );
});

OutlookLayers.displayName = 'OutlookLayers';

// Extract deeper JSX children into a small component to reduce nesting
// Optimized: Memoized to prevent re-renders when parent re-renders
const MapInner: React.FC<{ darkMode: boolean }> = memo(({ darkMode }) => {
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

      <OutlookLayers />

      <Legend />
    </>
  );
});

MapInner.displayName = 'MapInner';

// Geoman layer interface
interface GeomanLayer extends Layer {
  toGeoJSON(): GeoJSON.Feature;
}

// Map type that includes optional Geoman `pm` helpers (narrowly typed)
type MapWithPM = LeafletMap & {
  pm?: {
    disableDraw?: () => void;
    addControls?: (opts: Record<string, unknown>) => void;
    setGlobalOptions?: (opts: Record<string, unknown>) => void;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
  };
};

const ForecastMap = React.forwardRef<ForecastMapHandle>((_, ref) => {
  const dispatch = useDispatch();
  // Optimized: Select only drawingState to avoid re-rendering on other forecast changes (like map view)
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  
  // Store drawingState in a ref so our callback always has latest values
  const drawingStateRef = useRef(drawingState);
  useEffect(() => {
    drawingStateRef.current = drawingState;
  }, [drawingState]);
  
  // Expose the map instance through the ref
  useImperativeHandle(ref, () => ({
    getMap: () => mapInstance
  }), [mapInstance]);
  
  // Drawing creation handler for Geoman
  const handlePolygonCreated = useCallback((layer: Layer, originalLayer?: Layer) => {
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

  // Handle keyboard shortcuts for drawing
  useEffect(() => {
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
          const gmMap = mapInstance as MapWithPM;
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

          <MapInner darkMode={darkMode} />

          <div className="map-toolbar-bottom-right">
            <button 
              className="map-toolbar-button"
              onClick={() => dispatch(toggleLowProbability())}
              title="Toggle Low Probability / No Thunderstorms"
              aria-label="Toggle Low Probability Overlay"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
              </svg>
            </button>
          </div>

          <StatusOverlay />
      </MapContainer>
    </div>
  );
});

// Set display name for better debugging
ForecastMap.displayName = 'ForecastMap';

export default ForecastMap;