import { useEffect, useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from './store';
import { setActiveOutlookType, setEmergencyMode } from './store/forecastSlice';
import { RootState } from './store';
import { OutlookType } from './types/outlooks';
import useAutoCategorical from './hooks/useAutoCategorical';
import './App.css';

// Import required libraries 
import 'leaflet/dist/leaflet.css';
import { isAnyOutlookEnabled, getFirstEnabledOutlookType } from './utils/featureFlagsUtils';

import { useAutoSave } from './hooks/useAutoSave';
import { useCycleHistoryPersistence } from './utils/cycleHistoryPersistence';

// New UI components
import { AppLayout } from './components/Layout';
import { HomePage, ForecastPage, DiscussionPage, VerificationPage, ComingSoonPage } from './pages';

// Launch gate: set REACT_APP_COMING_SOON=true in the public build to enable pre-launch mode.
// The app auto-unlocks at the launch date/time regardless of the env var.
const LAUNCH_TIME = new Date('2026-03-01T18:00:00.000Z').getTime(); // noon CST
const COMING_SOON_MODE = process.env.REACT_APP_COMING_SOON === 'true';

function useLaunchGate(): boolean {
  const [launched, setLaunched] = useState(() => Date.now() >= LAUNCH_TIME);
  useEffect(() => {
    if (launched) return;
    const delay = Math.max(0, LAUNCH_TIME - Date.now());
    const t = setTimeout(() => setLaunched(true), delay);
    return () => clearTimeout(t);
  }, [launched]);
  return launched;
}

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
  const isLaunched = useLaunchGate();
  const showComingSoon = COMING_SOON_MODE && !isLaunched;

  return (
    <Provider store={store}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        {!showComingSoon && <AppHooks />}
        <Routes>
          {showComingSoon ? (
            <>
              <Route index element={<ComingSoonPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="forecast" element={<ForecastPage />} />
              <Route path="discussion" element={<DiscussionPage />} />
              <Route path="verification" element={<VerificationPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}
        </Routes>
      </BrowserRouter>
    </Provider>
  );
}

export default App;
