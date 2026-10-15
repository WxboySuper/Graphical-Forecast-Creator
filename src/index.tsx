import { isSentryEnabled } from './instrument';
import { reactErrorHandler } from '@sentry/react';
import './immerSetup';
// skipcq: JS-W1028
import React from 'react';
// skipcq: JS-C1003
import * as ReactDOM from 'react-dom/client';
import './index.css';
import './darkMode.css';
import App from './App';
import { store } from './store';
import { initializeStorePersistence } from './store/persistence';
import { ClerkProvider } from '@clerk/react';
import { betaClerkPublishableKey, isBetaClerkD1Mode } from './lib/betaApi';

// Browser-only hydration and persistence are explicit application bootstrap,
// not import-time behavior of the Redux store modules.
initializeStorePersistence(store);

const rootElement = document.getElementById('root') as HTMLElement;
const root = ReactDOM.createRoot(
  rootElement,
  isSentryEnabled()
    ? {
        onUncaughtError: reactErrorHandler((error, errorInfo) => {
          console.warn('Uncaught error', error, errorInfo.componentStack);
        }),
        onCaughtError: reactErrorHandler(),
        onRecoverableError: reactErrorHandler(),
      }
    : undefined
);
const application = isBetaClerkD1Mode()
  ? <ClerkProvider publishableKey={betaClerkPublishableKey}><App /></ClerkProvider>
  : <App />;

root.render(<React.StrictMode>{application}</React.StrictMode>);
