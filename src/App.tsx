import { useEffect } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from './store';
import { setActiveOutlookType, setEmergencyMode, importForecastCycle } from './store/forecastSlice';
import { RootState } from './store';
import { OutlookType } from './types/outlooks';
import useAutoCategorical from './hooks/useAutoCategorical';
import './App.css';

// Import required libraries 
import 'leaflet/dist/leaflet.css';
import { isAnyOutlookEnabled, getFirstEnabledOutlookType } from './utils/featureFlagsUtils';

import { useAutoSave } from './hooks/useAutoSave';
import { useCycleHistoryPersistence } from './utils/cycleHistoryPersistence';
import { validateForecastData, deserializeForecast } from './utils/fileUtils';

// New UI components
import { AppLayout } from './components/Layout';
import { HomePage, ForecastPage, DiscussionPage, VerificationPage } from './pages';

// App-level hooks component (runs shared hooks)
const AppHooks = () => {
  const dispatch = useDispatch();
  const featureFlags = useSelector((state: RootState) => state.featureFlags);

  // Use the auto categorical hook to generate categorical outlooks
  useAutoCategorical();
  
  // Enable Auto-Save
  useAutoSave();
  
  // Load cycle history from localStorage
  useCycleHistoryPersistence();

  // Load last session data from localStorage
  useEffect(() => {
    const savedData = localStorage.getItem('forecastData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (validateForecastData(parsed)) {
          const deserialized = deserializeForecast(parsed);
          dispatch(importForecastCycle(deserialized));
          console.log('AppHooks - Hydrated forecast from localStorage');
        }
      } catch (e) {
        console.error('AppHooks - Failed to hydrate forecast from localStorage', e);
      }
    }
  }, [dispatch]);

  // Initialize feature flags state
  useEffect(() => {
    const anyEnabled = isAnyOutlookEnabled(featureFlags);
    dispatch(setEmergencyMode(!anyEnabled));
    const firstEnabled = getFirstEnabledOutlookType(featureFlags);
    dispatch(setActiveOutlookType(firstEnabled as OutlookType));
  }, [dispatch, featureFlags]);

  return null;
};

// Main App with Router
function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AppHooks />
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="forecast" element={<ForecastPage />} />
            <Route path="discussion" element={<DiscussionPage />} />
            <Route path="verification" element={<VerificationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Provider>
  );
}

export default App;
