import { useState, useRef, useCallback, useEffect } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store';
import ForecastMap, { ForecastMapHandle } from './components/Map/ForecastMap';
import OutlookPanel from './components/OutlookPanel/OutlookPanel';
import DrawingTools from './components/DrawingTools/DrawingTools';
import Documentation from './components/Documentation/Documentation';
import { importForecasts, markAsSaved, resetForecasts, setMapView, setActiveOutlookType, setActiveProbability, toggleSignificant, setEmergencyMode } from './store/forecastSlice';
import { RootState } from './store';
import { OutlookData, OutlookType } from './types/outlooks';
import useAutoCategorical from './hooks/useAutoCategorical';
import './App.css';

// Import required libraries 
import { featureGroup, geoJSON, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ToastManager } from './components/Toast/Toast';
import { v4 as uuidv4 } from 'uuid';
import type { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { isAnyOutlookEnabled, getFirstEnabledOutlookType } from './utils/featureFlagsUtils';

// hooks imported above

// Helper to get probability list based on outlook type
const getProbabilityList = (activeOutlookType: string) => {
  switch (activeOutlookType) {
    case 'categorical':
      return ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'] as readonly string[];
    case 'tornado':
      return ['2%', '5%', '10%', '15%', '30%', '45%', '60%'] as readonly string[];
    case 'wind':
    case 'hail':
      return ['5%', '15%', '30%', '45%', '60%'] as readonly string[];
    default:
      return [] as readonly string[];
  }
};

// Helper to check if user is typing in an input
const isTyping = (e: KeyboardEvent) => {
  return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
};

// Helper to check for save shortcut
const isSaveKey = (e: KeyboardEvent) => {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's';
};

// Helper to check for any modifier keys
const hasAnyModifier = (e: KeyboardEvent) => {
  return e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
};

// Helper to handle general thunderstorm risk
// App dispatch / toast types
type AppDispatch = typeof store.dispatch;
type AddToastFn = (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
type Probability = "TSTM" | "MRGL" | "SLGT" | "ENH" | "MDT" | "HIGH" | "2%" | "5%" | "10%" | "10#" | "15%" | "15#" | "30%" | "30#" | "45%" | "45#" | "60%" | "60#";

const handleGeneralThunderstorm = (activeOutlookType: string, dispatch: AppDispatch, addToast: AddToastFn) => {
  if (activeOutlookType === 'categorical') {
    dispatch(setActiveProbability('TSTM'));
    addToast('Added General Thunderstorm risk', 'info');
  }
};

// Helper to switch outlook type
// Helper to switch outlook type
const switchType = (dispatch: AppDispatch, currentType: string, targetType: string, addToast: AddToastFn) => {
  if (currentType !== targetType) {
    dispatch(setActiveOutlookType(targetType as OutlookType));
    addToast(`Switched to ${targetType.charAt(0).toUpperCase() + targetType.slice(1)} outlook`, 'info');
  }
};

// Helper to handle significant threat toggle
const handleSignificantToggle = (params: {
  activeOutlookType: string;
  activeProbability: string;
  isSignificant: boolean;
  dispatch: AppDispatch;
  addToast: AddToastFn;
}) => {
  const { activeOutlookType, activeProbability, isSignificant, dispatch, addToast } = params;

  const canToggleSignificant = activeOutlookType !== 'categorical' &&
    (activeOutlookType === 'tornado' ?
      !['2%', '5%'].includes(activeProbability) :
      !['5%'].includes(activeProbability));

  if (canToggleSignificant) {
    dispatch(toggleSignificant());
    addToast(`${isSignificant ? 'Disabled' : 'Enabled'} significant threat`, 'info');
  } else {
    addToast('Significant threat not available for this probability', 'warning');
  }
};

// Helper to handle probability navigation (accepts single params object to limit arg count)
const handleProbNav = (params: {
  key: string;
  activeOutlookType: string;
  activeProbability: string;
  dispatch: AppDispatch;
  addToast: AddToastFn;
}) => {
  const { key, activeOutlookType, activeProbability, dispatch, addToast } = params;
  const probabilities = getProbabilityList(activeOutlookType);
  const currentIndex = probabilities.indexOf(activeProbability.replace('#', '%'));
  const isUp = key === 'arrowup' || key === 'arrowright';

  if (isUp && currentIndex < probabilities.length - 1) {
    const nextProb = probabilities[currentIndex + 1];
    dispatch(setActiveProbability(nextProb as Probability));
    addToast(`Increased to ${nextProb}`, 'info');
  } else if (!isUp && currentIndex > 0) {
    const prevProb = probabilities[currentIndex - 1];
    dispatch(setActiveProbability(prevProb as Probability));
    addToast(`Decreased to ${prevProb}`, 'info');
  }
};

// Helper function to fit map to feature bounds
const fitMapToFeatures = (map: LeafletMap, outlooks: OutlookData, dispatch: AppDispatch) => {
  const allFeatures = featureGroup();

  for (const outlookMap of Object.values(outlooks)) {
    for (const features of Array.from(outlookMap.values())) {
      for (const feature of (features as Feature<Geometry, GeoJsonProperties>[])) {
        geoJSON(feature).addTo(allFeatures);
      }
    }
  }

  if (allFeatures.getLayers().length > 0) {
    const bounds = allFeatures.getBounds();
    map.fitBounds(bounds, { padding: [50, 50] });

    const center = map.getCenter();
    dispatch(setMapView({
      center: [center.lat, center.lng],
      zoom: map.getZoom()
    }));
  }
};

// Helper to perform save operation
const mapToArray = (m?: Map<string, unknown>) => (m ? Array.from(m.entries()) : []);

const serializeOutlooks = (o: OutlookData) => ({
  tornado: mapToArray(o.tornado),
  wind: mapToArray(o.wind),
  hail: mapToArray(o.hail),
  categorical: mapToArray(o.categorical)
});

const buildMapView = (ref: React.RefObject<ForecastMapHandle>) => {
  const map = ref.current?.getMap();
  const center = map?.getCenter();
  return {
    center: center ? [center.lat, center.lng] : [39.8283, -98.5795],
    zoom: map?.getZoom() || 4
  };
};

const performSave = (
  outlooks: OutlookData,
  mapRef: React.RefObject<ForecastMapHandle>,
  dispatch: AppDispatch,
  addToast: AddToastFn
) => {
  try {
    const saveData = {
      outlooks: serializeOutlooks(outlooks),
      mapView: buildMapView(mapRef)
    };

    localStorage.setItem('forecastData', JSON.stringify(saveData));
    dispatch(markAsSaved());
    addToast('Forecast saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving forecast:', error);
    addToast('Error saving forecast. Please try again.', 'error');
  }
};

// Helper to perform load operation
const performLoad = (
  dispatch: AppDispatch,
  addToast: AddToastFn,
  mapRef: React.RefObject<ForecastMapHandle>
) => {
  try {
    const savedData = localStorage.getItem('forecastData');
    if (!savedData) {
      addToast('No saved forecast found.', 'warning');
      return;
    }
    
    const parsedData = JSON.parse(savedData);
    
    const entries = parsedData.outlooks as {
      [K in keyof OutlookData]: [string, Feature<Geometry, GeoJsonProperties>[]][]
    };

    const deserializedOutlooks: OutlookData = {
      tornado: new Map(entries.tornado),
      wind: new Map(entries.wind),
      hail: new Map(entries.hail),
      categorical: new Map(entries.categorical)
    };
    
    dispatch(resetForecasts());
    dispatch(importForecasts(deserializedOutlooks));
    const map = mapRef.current?.getMap();
    if (!map) {
      addToast('Forecast loaded successfully!', 'success');
      return;
    }

    if (parsedData.mapView) {
      dispatch(setMapView(parsedData.mapView));
    } else {
      fitMapToFeatures(map, deserializedOutlooks, dispatch);
    }
    
    addToast('Forecast loaded successfully!', 'success');
  } catch (error) {
    console.error('Error loading forecast:', error);
    addToast('Error loading forecast. The saved data might be corrupted.', 'error');
  }
};

// Component for emergency mode message
const EmergencyModeMessage = () => (
  <div className="emergency-mode-message">
    <h2>⚠️ Application in Emergency Mode</h2>
    <p>
      All outlook types are currently disabled. This is typically done during critical maintenance 
      or when addressing severe issues.
    </p>
    <p>
      The application&apos;s drawing capabilities have been temporarily suspended. 
      Please check back later or contact the administrator.
    </p>
    <p>
      For more information visit the GitHub repository  <a href="https://github.com/WxboySuper/Graphical-Forecast-Creator/issues?q=is%3Aissue%20state%3Aopen%20label%3AEmergency">here</a>.
    </p>
  </div>
);

// App content component to access hooks
const AppContent = () => {
  const dispatch = useDispatch();
  const featureFlags = useSelector((state: RootState) => state.featureFlags);
  const { outlooks, isSaved, emergencyMode } = useSelector((state: RootState) => state.forecast);
  const { drawingState } = useSelector((state: RootState) => state.forecast);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const mapRef = useRef<ForecastMapHandle>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' }>>([]);
  
  // Use the auto categorical hook to generate categorical outlooks
  useAutoCategorical();
  
  // Initialize feature flags state
  useEffect(() => {
    // Check if any outlook types are enabled
    const anyEnabled = isAnyOutlookEnabled(featureFlags);
    dispatch(setEmergencyMode(!anyEnabled));

    // Use first available outlook type or fallback to categorical to avoid null/undefined
    const firstEnabled = getFirstEnabledOutlookType(featureFlags) ?? 'categorical';
    dispatch(setActiveOutlookType(firstEnabled as OutlookType));
  }, [dispatch, featureFlags]);

  // Toast management
  const addToast = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Save forecast data to localStorage
  const handleSave = useCallback(() => {
    performSave(outlooks, mapRef, dispatch, addToast);
  }, [outlooks, dispatch, mapRef, addToast]);
  
  // Load forecast data from localStorage
  const handleLoad = useCallback(() => {
    performLoad(dispatch, addToast, mapRef);
  }, [dispatch, addToast, mapRef]);
  
  // Toggle documentation visibility
  const toggleDocumentation = useCallback(() => {
    setShowDocumentation(prev => !prev);
  }, []);
  
  // Warn before closing/refreshing if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSaved) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = message;
        return message;
      }
      return undefined;
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaved]);

  // Add keyboard shortcuts
  useEffect(() => {
    const { activeOutlookType, activeProbability, isSignificant } = drawingState;
    // Small named handlers reduce cyclomatic complexity of this effect
    const handleToggleDocumentation = () => {
      setShowDocumentation(prev => !prev);
      addToast('Documentation toggled', 'info');
    };

    const makeSwitchHandler = (target: string) => () => switchType(dispatch, activeOutlookType, target, addToast);

    const handleSignificant = () => handleSignificantToggle({ activeOutlookType, activeProbability, isSignificant, dispatch, addToast });

    const keyHandlers: Record<string, () => void> = {
      h: handleToggleDocumentation,
      t: makeSwitchHandler('tornado'),
      w: makeSwitchHandler('wind'),
      l: makeSwitchHandler('hail'),
      c: makeSwitchHandler('categorical'),
      g: () => handleGeneralThunderstorm(activeOutlookType, dispatch, addToast),
      s: handleSignificant,
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;

      if (isSaveKey(e)) {
        e.preventDefault();
        if (!isSaved) handleSave();
        return;
      }

      if (hasAnyModifier(e)) return;

      const key = e.key.toLowerCase();

      const handler = keyHandlers[key];
      if (handler) {
        handler();
        return;
      }

      if (['arrowup', 'arrowright', 'arrowdown', 'arrowleft'].includes(key)) {
        handleProbNav({ key, activeOutlookType, activeProbability, dispatch, addToast });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, isSaved, drawingState, handleSave, addToast]);
  
  return (
    <div className="App">
      <header className="App-header">
        <h1>Graphical Forecast Creator</h1>
        <p className="App-subtitle">Create graphical severe weather forecasts on a CONUS map</p>
        <button className="doc-toggle-btn" onClick={toggleDocumentation}>
          {showDocumentation ? 'Hide Documentation' : 'Show Documentation'}
        </button>
      </header>
      
      <main className={`App-main ${emergencyMode ? 'emergency-mode' : ''}`}>
        {showDocumentation && <Documentation />}
        
        {emergencyMode ? (
          <EmergencyModeMessage />
        ) : (
          <>
            <DrawingTools onSave={handleSave} onLoad={handleLoad} mapRef={mapRef} />
            <OutlookPanel />
            <ForecastMap ref={mapRef} />
          </>
        )}
      </main>
      <ToastManager toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};

function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

export default App;
