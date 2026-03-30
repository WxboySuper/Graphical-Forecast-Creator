import { useEffect, useState, useCallback } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from './store';
import type { RootState } from './store';
import { setActiveOutlookType, setEmergencyMode } from './store/forecastSlice';
import { OutlookType } from './types/outlooks';
import useAutoCategorical from './hooks/useAutoCategorical';
import './App.css';

// Import required libraries 
import 'leaflet/dist/leaflet.css';
import { isAnyOutlookEnabled, getFirstEnabledOutlookType } from './utils/featureFlagsUtils';

import { useAutoSave } from './hooks/useAutoSave';
import { useCycleHistoryPersistence } from './utils/cycleHistoryPersistence';
import { AuthProvider } from './auth/AuthProvider';
import { EntitlementProvider } from './billing/EntitlementProvider';

// New UI components
import { AppLayout } from './components/Layout';
import { HomePage, ForecastPage, DiscussionPage, VerificationPage, ComingSoonPage, AccountPage, PricingPage } from './pages';
import CloudLibraryPage from './pages/CloudLibraryPage';
import ToSModal, { hasAcceptedToS } from './components/ToS/ToSModal';
import PrivacyPolicyModal, { hasAcceptedPrivacyPolicy } from './components/PrivacyPolicy/PrivacyPolicyModal';

// Launch gate: set VITE_COMING_SOON=true in the public build to enable pre-launch mode.
// The app auto-unlocks at the launch date/time regardless of the env var.
const LAUNCH_TIME = new Date('2026-03-01T18:00:00.000Z').getTime(); // noon CST
const COMING_SOON_MODE = __GFC_COMING_SOON__;

// Custom hook to manage the launch gate, which checks the current date against a predefined launch time and returns whether the app has launched. It also sets up a timer to update the launched state when the launch time is reached, allowing for real-time transition from coming soon mode to live mode without needing a page refresh.
function useLaunchGate(): boolean {
  const [launched, setLaunched] = useState(() => Date.now() >= LAUNCH_TIME);
  useEffect(() => {
    let launchTimer: ReturnType<typeof setTimeout> | undefined;

    if (!launched) {
      const delay = Math.max(0, LAUNCH_TIME - Date.now());
      launchTimer = setTimeout(() => setLaunched(true), delay);
    }

    return () => {
      if (launchTimer) {
        clearTimeout(launchTimer);
      }
    };
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

interface AgreementGateProps {
  showComingSoon: boolean;
}

/** Handles the launch-dependent agreement flow before the main app is allowed to initialize. */
const AgreementGate: React.FC<AgreementGateProps> = ({ showComingSoon }) => {
  const [tosAccepted, setTosAccepted] = useState(() => hasAcceptedToS());
  const [privacyAccepted, setPrivacyAccepted] = useState(() => hasAcceptedPrivacyPolicy());

  const handleAcceptToS = useCallback(() => {
    setTosAccepted(true);
  }, []);

  const handleAcceptPrivacyPolicy = useCallback(() => {
    setPrivacyAccepted(true);
  }, []);

  useEffect(() => {
    if (showComingSoon) {
      return;
    }

    setTosAccepted(hasAcceptedToS());
    setPrivacyAccepted(hasAcceptedPrivacyPolicy());
  }, [showComingSoon]);

  if (showComingSoon || !tosAccepted) {
    return showComingSoon ? null : <ToSModal onAccept={handleAcceptToS} />;
  }

  if (!privacyAccepted) {
    return <PrivacyPolicyModal onAccept={handleAcceptPrivacyPolicy} />;
  }

  return <AppHooks />;
};

interface AppRoutesProps {
  showComingSoon: boolean;
}

/** Selects between the public launch gate routes and the full application routes. */
const AppRoutes: React.FC<AppRoutesProps> = ({ showComingSoon }) => {
  if (showComingSoon) {
    return (
      <Routes>
        <Route index element={<ComingSoonPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="cloud" element={<CloudLibraryPage />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="discussion" element={<DiscussionPage />} />
        <Route path="verification" element={<VerificationPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

// Main App with Router
function App() {
  const isLaunched = useLaunchGate();
  const showComingSoon = COMING_SOON_MODE && !isLaunched;

  return (
    <Provider store={store}>
      <AuthProvider>
        <EntitlementProvider>
          <BrowserRouter>
            <AgreementGate showComingSoon={showComingSoon} />
            <AppRoutes showComingSoon={showComingSoon} />
          </BrowserRouter>
        </EntitlementProvider>
      </AuthProvider>
    </Provider>
  );
}

export default App;
