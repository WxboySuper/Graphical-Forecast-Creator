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
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
