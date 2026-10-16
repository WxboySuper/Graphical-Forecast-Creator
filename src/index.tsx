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
import { betaClerkPublishableKey } from './lib/betaApi';

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
const clerkD1BuildSelected = typeof __GFC_BETA_CLERK_D1__ !== 'undefined' && __GFC_BETA_CLERK_D1__;
let application: React.ReactNode;
if (clerkD1BuildSelected && betaClerkPublishableKey) {
  application = <ClerkProvider publishableKey={betaClerkPublishableKey}><App /></ClerkProvider>;
} else {
  application = (
    <>
      {clerkD1BuildSelected ? (
        <section role="alert" className="flex items-center justify-between gap-4 bg-destructive px-4 py-3 text-destructive-foreground">
          <span>Beta Clerk authentication is enabled, but its publishable key is missing. The app is using Firebase auth; retry after the deployment configuration is repaired.</span>
          <button type="button" onClick={() => window.location.reload()}>Retry</button>
        </section>
      ) : null}
      <App />
    </>
  );
}

root.render(<React.StrictMode>{application}</React.StrictMode>);
