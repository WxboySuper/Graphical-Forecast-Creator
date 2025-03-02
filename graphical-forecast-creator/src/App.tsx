import React from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store';
import ForecastMap from './components/Map/ForecastMap';
import OutlookPanel from './components/OutlookPanel/OutlookPanel';
import DrawingTools from './components/DrawingTools/DrawingTools';
import { importForecasts, markAsSaved } from './store/forecastSlice';
import { RootState } from './store';
import './App.css';

// Import required libraries 
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// App content component to access hooks
const AppContent = () => {
  const dispatch = useDispatch();
  const { outlooks, isSaved } = useSelector((state: RootState) => state.forecast);
  
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
      
      localStorage.setItem('forecastData', JSON.stringify(serializedOutlooks));
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
      
      const parsedData = JSON.parse(savedData);
      
      // Convert arrays back to Map objects
      const deserializedOutlooks = {
        tornado: new Map(parsedData.tornado),
        wind: new Map(parsedData.wind),
        hail: new Map(parsedData.hail),
        categorical: new Map(parsedData.categorical)
      };
      
      dispatch(importForecasts(deserializedOutlooks));
      alert('Forecast loaded successfully!');
    } catch (error) {
      console.error('Error loading forecast:', error);
      alert('Error loading forecast. The saved data might be corrupted.');
    }
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
      </header>
      
      <main className="App-main">
        <DrawingTools onSave={handleSave} onLoad={handleLoad} />
        <OutlookPanel />
        <ForecastMap />
      </main>
      
      <footer className="App-footer">
        <p>Based on Storm Prediction Center's severe weather outlooks</p>
        <p>
          <a href="/docs" target="_blank" rel="noopener noreferrer">Documentation</a>
        </p>
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
