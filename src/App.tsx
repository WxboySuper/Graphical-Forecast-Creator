import React, { useState, useRef, useCallback } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store';
import ForecastMap, { ForecastMapHandle } from './components/Map/ForecastMap';
import OutlookPanel from './components/OutlookPanel/OutlookPanel';
import DrawingTools from './components/DrawingTools/DrawingTools';
import Documentation from './components/Documentation/Documentation';
import { importForecasts, markAsSaved, resetForecasts, setMapView, setActiveOutlookType, setActiveProbability, toggleSignificant, setEmergencyMode } from './store/forecastSlice';
import { RootState } from './store';
import { OutlookData } from './types/outlooks';
import useAutoCategorical from './hooks/useAutoCategorical';
import './App.css';

// Import required libraries 
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { ToastManager } from './components/Toast/Toast';
import { v4 as uuidv4 } from 'uuid';
import type { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { isAnyOutlookEnabled, getFirstEnabledOutlookType } from './utils/featureFlagsUtils';

// App content component to access hooks
const AppContent = () => {
  const dispatch = useDispatch();
  const featureFlags = useSelector((state: RootState) => state.featureFlags);
  const { outlooks, isSaved } = useSelector((state: RootState) => state.forecast);
  const { drawingState } = useSelector((state: RootState) => state.forecast);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const mapRef = useRef<ForecastMapHandle>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' }>>([]);
  
  // Use the auto categorical hook to generate categorical outlooks
  useAutoCategorical();
  
  // Initialize feature flags state
  React.useEffect(() => {
    // Check if any outlook types are enabled
    const anyEnabled = isAnyOutlookEnabled(featureFlags);
    dispatch(setEmergencyMode(!anyEnabled));

    // If current outlook type is disabled, switch to first available
    if (!anyEnabled) {
      dispatch(setActiveOutlookType('categorical')); // Fallback when all disabled
    } else {
      const firstEnabled = getFirstEnabledOutlookType(featureFlags);
      dispatch(setActiveOutlookType(firstEnabled));
    }
  }, [dispatch, featureFlags]);

  // Save forecast data to localStorage
  const handleSave = useCallback(() => {
    try {
      // Convert Map objects to arrays for serialization
      const serializedOutlooks = {
        tornado: Array.from(outlooks.tornado.entries()),
        wind: Array.from(outlooks.wind.entries()),
        hail: Array.from(outlooks.hail.entries()),
        categorical: Array.from(outlooks.categorical.entries())
      };

      // Save both outlooks and current map view
      const saveData = {
        outlooks: serializedOutlooks,
        mapView: {
          center: mapRef.current?.getMap()?.getCenter() 
            ? [mapRef.current.getMap()!.getCenter().lat, mapRef.current.getMap()!.getCenter().lng]
            : [39.8283, -98.5795],
          zoom: mapRef.current?.getMap()?.getZoom() || 4
        }
      };
      
      localStorage.setItem('forecastData', JSON.stringify(saveData));
      dispatch(markAsSaved());
      alert('Forecast saved successfully!');
    } catch (error) {
      console.error('Error saving forecast:', error);
      alert('Error saving forecast. Please try again.');
    }
  }, [outlooks, dispatch, mapRef]);
  
  // Load forecast data from localStorage
  const handleLoad = () => {
    try {
      const savedData = localStorage.getItem('forecastData');
      if (!savedData) {
        alert('No saved forecast found.');
        return;
      }
      
      // Clear existing forecasts before loading new ones
      dispatch(resetForecasts());
      
      const parsedData = JSON.parse(savedData);
      
      // Type check the loaded data
      const entries = parsedData.outlooks as {
        [K in keyof OutlookData]: [string, Feature<Geometry, GeoJsonProperties>[]][]
      };

      const deserializedOutlooks: OutlookData = {
        tornado: new Map(entries.tornado),
        wind: new Map(entries.wind),
        hail: new Map(entries.hail),
        categorical: new Map(entries.categorical)
      };
      
      // Restore the outlooks
      dispatch(importForecasts(deserializedOutlooks));

      // Restore map view if saved, otherwise fit to feature bounds
      if (parsedData.mapView && mapRef.current?.getMap()) {
        dispatch(setMapView(parsedData.mapView));
      } else if (mapRef.current?.getMap()) {
        // Create FeatureGroup with all features to get bounds
        const map = mapRef.current.getMap();
        if (map) {
          const allFeatures = L.featureGroup();
          
          // Type-safe feature iteration
          Object.values(deserializedOutlooks).forEach(outlookMap => {
            Array.from(outlookMap.values()).forEach((features) => {
              (features as Feature<Geometry, GeoJsonProperties>[]).forEach((feature: Feature<Geometry, GeoJsonProperties>) => {
                L.geoJSON(feature).addTo(allFeatures);
              });
            });
          });

          // If there are features, fit the map to their bounds
          if (allFeatures.getLayers().length > 0) {
            const bounds = allFeatures.getBounds();
            map.fitBounds(bounds, { padding: [50, 50] });
            
            // Update the store with new view
            const center = map.getCenter();
            dispatch(setMapView({
              center: [center.lat, center.lng],
              zoom: map.getZoom()
            }));
          }
        }
      }
      
      alert('Forecast loaded successfully!');
    } catch (error) {
      console.error('Error loading forecast:', error);
      alert('Error loading forecast. The saved data might be corrupted.');
    }
  };
  
  // Toggle documentation visibility
  const toggleDocumentation = () => {
    setShowDocumentation(!showDocumentation);
  };
  
  // Warn before closing/refreshing if there are unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSaved) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = message;
        return message;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaved]);

  const addToast = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Add keyboard shortcuts
  React.useEffect(() => {
    const { activeOutlookType, activeProbability, isSignificant } = drawingState;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Handle Ctrl/Cmd + S first
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isSaved) handleSave();
        return;
      }

      // Don't trigger other shortcuts if modifiers are pressed
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
        return;
      }

      const getProbabilityList = () => {
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

      switch (e.key.toLowerCase()) {
        // Toggle documentation with 'h' (help)
        case 'h':
          setShowDocumentation(prev => !prev);
          addToast('Documentation toggled', 'info');
          break;

        // Switch between outlook types
        case 't':
          if (activeOutlookType !== 'tornado') {
            dispatch(setActiveOutlookType('tornado'));
            addToast('Switched to Tornado outlook', 'info');
          }
          break;
        case 'w':
          if (activeOutlookType !== 'wind') {
            dispatch(setActiveOutlookType('wind'));
            addToast('Switched to Wind outlook', 'info');
          }
          break;
        case 'l':
          if (activeOutlookType !== 'hail') {
            dispatch(setActiveOutlookType('hail'));
            addToast('Switched to Hail outlook', 'info');
          }
          break;
        case 'c':
          if (activeOutlookType !== 'categorical') {
            dispatch(setActiveOutlookType('categorical'));
            addToast('Switched to Categorical outlook', 'info');
          }
          break;

        // Add General Thunderstorm risk with 'g'
        case 'g':
          if (activeOutlookType === 'categorical') {
            dispatch(setActiveProbability('TSTM'));
            addToast('Added General Thunderstorm risk', 'info');
          }
          break;

        // Toggle significant threat with 's'
        case 's':
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
          break;

        // Navigate probabilities with arrow keys
        case 'arrowup':
        case 'arrowright':
          {
            const probabilities = getProbabilityList();
            const currentIndex = probabilities.indexOf(activeProbability.replace('#', '%'));
            if (currentIndex < probabilities.length - 1) {
              const nextProb = probabilities[currentIndex + 1] as "TSTM" | "MRGL" | "SLGT" | "ENH" | "MDT" | "HIGH" | "2%" | "5%" | "10%" | "10#" | "15%" | "15#" | "30%" | "30#" | "45%" | "45#" | "60%" | "60#";
              dispatch(setActiveProbability(nextProb));
              addToast(`Increased to ${nextProb}`, 'info');
            }
          }
          break;

        case 'arrowdown':
        case 'arrowleft':
          {
            const probabilities = getProbabilityList();
            const currentIndex = probabilities.indexOf(activeProbability.replace('#', '%'));
            if (currentIndex > 0) {
              const prevProb = probabilities[currentIndex - 1] as "TSTM" | "MRGL" | "SLGT" | "ENH" | "MDT" | "HIGH" | "2%" | "5%" | "10%" | "10#" | "15%" | "15#" | "30%" | "30#" | "45%" | "45#" | "60%" | "60#";
              dispatch(setActiveProbability(prevProb));
              addToast(`Decreased to ${prevProb}`, 'info');
            }
          }
          break;

        // Delete selected feature with Delete key
        case 'delete':
        case 'backspace':
          // TODO: Implement feature selection and deletion
          break;
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
      
      <main className="App-main">
        {showDocumentation && <Documentation />}
        <DrawingTools onSave={handleSave} onLoad={handleLoad} mapRef={mapRef} />
        <OutlookPanel />
        <ForecastMap ref={mapRef} />
      </main>
      
      <footer className="App-footer">
        <p>Based on Storm Prediction Center's severe weather outlooks</p>
      </footer>
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
