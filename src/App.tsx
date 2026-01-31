import { useState, useRef, useCallback, useEffect } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store';
import ForecastMap, { ForecastMapHandle } from './components/Map/ForecastMap';
import OutlookPanel from './components/OutlookPanel/OutlookPanel';
import OutlookDaySelector from './components/OutlookDaySelector/OutlookDaySelector';
import DrawingTools from './components/DrawingTools/DrawingTools';
import Documentation from './components/Documentation/Documentation';
import VerificationMode from './components/VerificationMode/VerificationMode';
import DiscussionEditor from './components/DiscussionEditor/DiscussionEditor';
import { importForecastCycle, markAsSaved, setMapView, setActiveOutlookType, setActiveProbability, toggleSignificant, setEmergencyMode, selectCurrentOutlooks, selectForecastCycle } from './store/forecastSlice';
import { setAppMode } from './store/appModeSlice';
import { toggleDarkMode } from './store/themeSlice';
import { RootState } from './store';
import { OutlookData, OutlookType, Probability, ForecastCycle } from './types/outlooks';
import useAutoCategorical from './hooks/useAutoCategorical';
import './App.css';

// Import required libraries 
import { featureGroup, geoJSON, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ToastManager } from './components/Toast/Toast';
import { v4 as uuidv4 } from 'uuid';
import type { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { isAnyOutlookEnabled, getFirstEnabledOutlookType } from './utils/featureFlagsUtils';

import { deserializeForecast, validateForecastData, exportForecastToJson } from './utils/fileUtils';
import { useAutoSave } from './hooks/useAutoSave';
import { useCycleHistoryPersistence } from './utils/cycleHistoryPersistence';

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

const handleGeneralThunderstorm = (activeOutlookType: string, dispatch: AppDispatch, addToast: AddToastFn) => {
  if (activeOutlookType === 'categorical') {
    dispatch(setActiveProbability('TSTM'));
    addToast('Added General Thunderstorm risk', 'info');
  }
};

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

const buildMapView = (ref: React.RefObject<ForecastMapHandle>) => {
  const map = ref.current?.getMap();
  const center = map?.getCenter();
  return {
    center: (center ? [center.lat, center.lng] : [39.8283, -98.5795]) as [number, number],
    zoom: map?.getZoom() || 4
  };
};

// Logic to load state from a parsed data object
const loadStateFromData = (
  data: any,
  dispatch: AppDispatch,
  mapRef: React.RefObject<ForecastMapHandle>,
  addToast: AddToastFn,
  successMessage: string = 'Forecast loaded successfully!'
) => {
  if (!validateForecastData(data)) {
    addToast('Invalid forecast data format.', 'error');
    return;
  }

  const deserializedCycle = deserializeForecast(data);
  
  dispatch(importForecastCycle(deserializedCycle));
  
  const map = mapRef.current?.getMap();
  const currentOutlooks = deserializedCycle.days[deserializedCycle.currentDay]?.data;

  // Restore Map View if available
  if (data.mapView) {
    dispatch(setMapView(data.mapView));
  } else if (map && currentOutlooks) {
    fitMapToFeatures(map, currentOutlooks, dispatch);
  }
  
  addToast(successMessage, 'success');
};

// Save action = Export to File
const performSave = (
  forecastCycle: ForecastCycle,
  mapRef: React.RefObject<ForecastMapHandle>,
  dispatch: AppDispatch,
  addToast: AddToastFn
) => {
  try {
    exportForecastToJson(forecastCycle, buildMapView(mapRef));
    dispatch(markAsSaved());
    addToast('Forecast exported to JSON!', 'success');
  } catch (error) {
    console.error('Error exporting forecast:', error);
    addToast('Error exporting forecast.', 'error');
  }
};

// Load action = Import from File
const performLoadFromFile = async (
  file: File,
  dispatch: AppDispatch,
  mapRef: React.RefObject<ForecastMapHandle>,
  addToast: AddToastFn
) => {
  try {
    const text = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      addToast('File is not valid JSON.', 'error');
      return;
    }
    loadStateFromData(data, dispatch, mapRef, addToast);
  } catch (error) {
    console.error('Error loading file:', error);
    addToast('Error reading file.', 'error');
  }
};

// Auto-load from LocalStorage
const loadFromLocalStorage = (
  dispatch: AppDispatch,
  mapRef: React.RefObject<ForecastMapHandle>,
  addToast: AddToastFn
) => {
  try {
    const savedData = localStorage.getItem('forecastData');
    if (savedData) {
      const data = JSON.parse(savedData);
      loadStateFromData(data, dispatch, mapRef, addToast, 'Session restored from auto-save.');
    }
  } catch (error) {
    console.error('Error auto-loading:', error);
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
export const AppContent = () => {
  const dispatch = useDispatch();
  const featureFlags = useSelector((state: RootState) => state.featureFlags);
  const forecastCycle = useSelector(selectForecastCycle);
  const currentOutlooks = useSelector(selectCurrentOutlooks);
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const emergencyMode = useSelector((state: RootState) => state.forecast.emergencyMode);
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const appMode = useSelector((state: RootState) => state.appMode.mode);
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [showDiscussionEditor, setShowDiscussionEditor] = useState(false);
  const mapRef = useRef<ForecastMapHandle>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' }>>([]);
  
  // Toast management
  const addToast = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Use the auto categorical hook to generate categorical outlooks
  useAutoCategorical();
  
  // Enable Auto-Save
  useAutoSave();
  
  // Load cycle history from localStorage
  useCycleHistoryPersistence();
  
  // Auto-load session from LocalStorage on startup
  useEffect(() => {
    loadFromLocalStorage(dispatch, mapRef, addToast);
  }, [dispatch, addToast]);

  // Initialize feature flags state
  useEffect(() => {
    const anyEnabled = isAnyOutlookEnabled(featureFlags);
    dispatch(setEmergencyMode(!anyEnabled));
    const firstEnabled = getFirstEnabledOutlookType(featureFlags);
    dispatch(setActiveOutlookType(firstEnabled as OutlookType));
  }, [dispatch, featureFlags]);

  // Save (Export) forecast
  const handleSave = useCallback(() => {
    performSave(forecastCycle, mapRef, dispatch, addToast);
  }, [forecastCycle, mapRef, dispatch, addToast]);

  // Load (Import) forecast
  const handleLoad = useCallback((file: File) => {
    performLoadFromFile(file, dispatch, mapRef, addToast);
  }, [dispatch, addToast, mapRef]);
  
  // Toggle documentation visibility
  const toggleDocumentation = useCallback(() => {
    setShowDocumentation(prev => !prev);
  }, []);
  
  // Toggle discussion editor visibility
  const toggleDiscussionEditor = useCallback(() => {
    setShowDiscussionEditor(prev => !prev);
  }, []);
  
  // Toggle between forecast and verification modes
  const toggleMode = useCallback(() => {
    const newMode = appMode === 'forecast' ? 'verification' : 'forecast';
    dispatch(setAppMode(newMode));
    addToast(`Switched to ${newMode} mode`, 'info');
  }, [appMode, dispatch, addToast]);
  
  // Toggle dark mode
  const handleToggleDarkMode = useCallback(() => {
    dispatch(toggleDarkMode());
  }, [dispatch]);
  
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
        <div className="header-buttons">
          <button className="mode-toggle-btn" onClick={toggleMode}>
            {appMode === 'forecast' ? '📊 Switch to Verification' : '🎨 Switch to Forecast'}
          </button>
          <button className="dark-mode-toggle-btn" onClick={handleToggleDarkMode}>
            {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
          <button className="doc-toggle-btn" onClick={toggleDocumentation}>
            {showDocumentation ? 'Hide Documentation' : 'Show Documentation'}
          </button>
        </div>
      </header>
      
      <main className={`App-main ${emergencyMode ? 'emergency-mode' : ''}`}>
        {showDocumentation && <Documentation />}
        
        {appMode === 'verification' ? (
          <VerificationMode />
        ) : emergencyMode ? (
          <EmergencyModeMessage />
        ) : (
          <>
            <OutlookDaySelector />
            <DrawingTools 
              onSave={handleSave} 
              onLoad={handleLoad} 
              onOpenDiscussion={toggleDiscussionEditor}
              mapRef={mapRef} 
              addToast={addToast} 
            />
            <OutlookPanel />
            <ForecastMap ref={mapRef} />
          </>
        )}
      </main>
      {showDiscussionEditor && <DiscussionEditor onClose={toggleDiscussionEditor} />}
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
