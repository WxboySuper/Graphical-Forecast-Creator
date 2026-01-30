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
import { MapContainer, TileLayer, FeatureGroup, useMap, GeoJSON } from 'react-leaflet';
import { RootState } from '../../store';
import { addFeature, setMapView, removeFeature } from '../../store/forecastSlice';
import { OutlookType } from '../../types/outlooks';
import { colorMappings } from '../../utils/outlookUtils';
import { createTooltipContent, stripHtml } from '../../utils/domUtils';
import { v4 as uuidv4 } from 'uuid';
import './ForecastMap.css';
import Legend from './Legend';
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
type FeatureStyle = L.PathOptions & {
  className?: string;
  zIndex?: number;
  fillColor?: string;
  fillOpacity?: number;
};

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

// Component to render the outlook polygons

// Top-level helpers extracted to reduce component size and complexity
const sortProbabilities = (entries: [string, GeoJSON.Feature[]][]): [string, GeoJSON.Feature[]][] => {
  return entries.sort((a, b) => {
    const [probA, probB] = [a[0], b[0]];

    if (probA === 'TSTM') return -1;
    if (probB === 'TSTM') return 1;

    const isSignificantA = probA.includes('#');
    const isSignificantB = probB.includes('#');
    if (isSignificantA !== isSignificantB) {
      return isSignificantA ? 1 : -1;
    }

    const riskOrder: Record<string, number> = {
      'TSTM': 0, 'MRGL': 1, 'SLGT': 2, 'ENH': 3, 'MDT': 4, 'HIGH': 5
    };
    if (riskOrder[probA] !== undefined && riskOrder[probB] !== undefined) {
      return riskOrder[probA] - riskOrder[probB];
    }

    const getPercentValue = (prob: string) => parseInt(prob.replace(/[^0-9]/g, ''));
    return getPercentValue(probA) - getPercentValue(probB);
  });
};

const RISK_ORDER: Record<string, number> = {
  TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5
};

const lookupColor = (outlookType: OutlookType, probability: string) => {
  switch (outlookType) {
    case 'categorical':
      return colorMappings.categorical[probability as keyof typeof colorMappings.categorical] || '#FFFFFF';
    case 'tornado':
      return colorMappings.tornado[probability as keyof typeof colorMappings.tornado] || '#FFFFFF';
    case 'wind':
    case 'hail':
      return colorMappings.wind[probability as keyof typeof colorMappings.wind] || '#FFFFFF';
    default:
      return '#FFFFFF';
  }
};

const computeZIndex = (outlookType: OutlookType, probability: string) => {
  let baseZIndex = 400;
  if (outlookType === 'categorical') {
    baseZIndex += (RISK_ORDER[probability] || 0) * 10;
  } else if (['tornado', 'wind', 'hail'].includes(outlookType)) {
    baseZIndex += parseInt(probability) || 0;
  }

  if (probability.includes('#')) baseZIndex += 5;
  return baseZIndex;
};

const getFeatureStyle = (outlookType: OutlookType, probability: string) => {
  const color = lookupColor(outlookType, probability);
  const significant = probability.includes('#');
  const fillColor = significant ? 'url(#hatchPattern)' : color;
  const fillOpacity = significant ? 1 : 0.6;
  const zIndex = computeZIndex(outlookType, probability);

  return {
    color: significant ? 'transparent' : color,
    weight: 2,
    opacity: 1,
    fillColor,
    fillOpacity,
    zIndex,
    className: significant ? 'significant-threat-pattern' : undefined
  };
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
  onRequestDelete: (outlookType: OutlookType, probability: string, featureId: string, message: React.ReactNode) => void;
}

const createFeatureHandlersFactory = (context: OutlookRenderContext) => (outlookType: OutlookType, probability: string, featureId: string) => {
  const { map, onRequestDelete } = context;

  const handleClick = () => {
    // Check if drawing is active to prevent accidental deletion when clicking inside an existing polygon
    if (isDrawingMode(map)) {
      return;
    }

    const outlookName = outlookType.charAt(0).toUpperCase() + outlookType.slice(1);
    const safeProbability = stripHtml(probability);
    // Use a div with pre-wrap for newlines
    const message = (
      <div style={{ whiteSpace: 'pre-wrap' }}>
        Delete this {outlookName} outlook area?
        <br /><br />
        Risk Level: {safeProbability}{safeProbability.includes('#') ? ' (Significant)' : ''}
      </div>
    );

    onRequestDelete(outlookType, probability, featureId, message);
  };

  const handleMouseOver = (e: L.LeafletEvent) => {
    const layer = e.target as L.Layer;
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

  return {
    click: handleClick,
    mouseover: handleMouseOver
  };
};

// Create an onEachFeature factory that forces the Leaflet layer style and attaches handlers
function createOnEachFeature(
  styleObj: FeatureStyle,
  handlers: Record<string, (e: L.LeafletEvent) => void>
) {
  return function onEach(feature: GeoJSON.Feature, layer: L.Layer) {
    // Force the style on the created layer (in case global Geoman styles persist)
    const layerWithStyle = layer as L.Path & { setStyle?: (opts: L.PathOptions) => void };
    if (typeof layerWithStyle.setStyle === 'function') {
      try {
        layerWithStyle.setStyle(styleObj as L.PathOptions);
      } catch {
        // ignore
      }
    }

    // Also force underlying SVG attributes if available to override external styles
    try {
      const layerWithPath = layer as L.Layer & { _path?: SVGElement };
      const pathEl = layerWithPath._path;
      if (pathEl) {
        const fc = styleObj.fillColor;
        if (typeof fc === 'string' && !fc.startsWith('url(')) {
          pathEl.setAttribute('fill', fc);
        }
        pathEl.setAttribute('fill-opacity', String(styleObj.fillOpacity ?? 1));
        if (styleObj.color) pathEl.setAttribute('stroke', String(styleObj.color));
        pathEl.setAttribute('stroke-width', String(styleObj.weight ?? 1));
      }
    } catch {
      // ignore DOM write errors in server env
    }

    // Attach event handlers directly to the layer to ensure they bind
    const layerWithOn = layer as L.Layer & { on?: (event: string, fn: (...args: unknown[]) => void) => void };
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
          const onEach = createOnEachFeature(styleObj, handlers as Record<string, (e: L.LeafletEvent) => void>);
          // Use PathOptions directly - Leaflet applies these automatically
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

interface OutlookLayersProps {
  onRequestDelete: (outlookType: OutlookType, probability: string, featureId: string, message: React.ReactNode) => void;
}

// Now declare OutlookLayers (after helpers)
// Optimized: Memoized to prevent re-renders when map view or unrelated state changes
const OutlookLayers: React.FC<OutlookLayersProps> = React.memo(({ onRequestDelete }) => {
  const dispatch = useDispatch();
  const map = useMap();
  const outlooks = useSelector((state: RootState) => state.forecast.outlooks);
  const activeOutlookType = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);

  const context: OutlookRenderContext = {
    dispatch,
    map,
    activeOutlookType,
    styleFn: getFeatureStyle,
    onRequestDelete
  };

  const elements = renderOutlookFeatures(outlooks as OutlooksMap, context);

  if (elements.length === 0) return null;
  if (elements.length === 1) return elements[0];
  return React.createElement(React.Fragment, null, ...elements);
});

OutlookLayers.displayName = 'OutlookLayers';

interface MapInnerProps {
  onRequestDelete: (outlookType: OutlookType, probability: string, featureId: string, message: React.ReactNode) => void;
}

// Extract deeper JSX children into a small component to reduce nesting
// Optimized: Memoized to prevent re-renders when parent re-renders
const MapInner: React.FC<MapInnerProps> = React.memo(({ onRequestDelete }) => (
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

    <OutlookLayers onRequestDelete={onRequestDelete} />

    <Legend />
  </>
));

MapInner.displayName = 'MapInner';

// Geoman layer interface
interface GeomanLayer extends L.Layer {
  toGeoJSON(): GeoJSON.Feature;
}

// Map type that includes optional Geoman `pm` helpers (narrowly typed)
type MapWithPM = L.Map & {
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

          <MapInner onRequestDelete={handleRequestDelete} />
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
