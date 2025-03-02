import React, { useState, useRef } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store';
import ForecastMap, { ForecastMapHandle } from './components/Map/ForecastMap';
import OutlookPanel from './components/OutlookPanel/OutlookPanel';
import DrawingTools from './components/DrawingTools/DrawingTools';
import Documentation from './components/Documentation/Documentation';
import { importForecasts, markAsSaved, resetForecasts, setMapView } from './store/forecastSlice';
import { RootState } from './store';
import useAutoCategorical from './hooks/useAutoCategorical';
import './App.css';

// Import required libraries 
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// App content component to access hooks
const AppContent = () => {
  const dispatch = useDispatch();
  const { outlooks, isSaved } = useSelector((state: RootState) => state.forecast);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const mapRef = useRef<ForecastMapHandle>(null);
  
  // Use the auto categorical hook to generate categorical outlooks
  useAutoCategorical();
  
  // Save forecast data to localStorage
  const handleSave = () => {
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
  };
  
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
      
      // Convert arrays back to Map objects
      const deserializedOutlooks = {
        tornado: new Map(parsedData.outlooks.tornado),
        wind: new Map(parsedData.outlooks.wind),
        hail: new Map(parsedData.outlooks.hail),
        categorical: new Map(parsedData.outlooks.categorical)
      };
      
      // Restore both the outlooks and map view
      dispatch(importForecasts(deserializedOutlooks));
      if (parsedData.mapView) {
        dispatch(setMapView(parsedData.mapView));
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
