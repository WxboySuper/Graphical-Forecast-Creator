import * as Sentry from '@sentry/react';
import React from 'react';
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom';

declare const __GFC_SENTRY_DSN__: string;
declare const __GFC_SENTRY_ENVIRONMENT__: string;
declare const __GFC_APP_VERSION__: string;

<<<<<<< HEAD
=======
/** Returns the Sentry DSN baked in at build time, or an empty string when monitoring is off. */
>>>>>>> origin/pr/316
function getSentryDsn(): string {
  return typeof __GFC_SENTRY_DSN__ !== 'undefined' ? __GFC_SENTRY_DSN__ : '';
}

/** True when a DSN was baked into the build (hosted production or beta deploys). */
export function isSentryEnabled(): boolean {
  return Boolean(getSentryDsn().trim());
}

<<<<<<< HEAD
=======
/** Returns the Sentry release string derived from the app version, when available. */
>>>>>>> origin/pr/316
function getRelease(): string | undefined {
  const version = typeof __GFC_APP_VERSION__ !== 'undefined' ? __GFC_APP_VERSION__ : '';
  return version ? `graphical-forecast-creator@${version}` : undefined;
}

<<<<<<< HEAD
=======
/** Returns the configured Sentry environment label (production, beta, etc.). */
>>>>>>> origin/pr/316
function getEnvironment(): string {
  const configured =
    typeof __GFC_SENTRY_ENVIRONMENT__ !== 'undefined' ? __GFC_SENTRY_ENVIRONMENT__ : '';
  return configured.trim() || 'production';
}

/** Initializes Sentry when a DSN is present. No-op in local dev without a DSN. */
export function initSentry(): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.init({
    dsn: getSentryDsn(),
    environment: getEnvironment(),
    release: getRelease(),
    sendDefaultPii: false,
    enableLogs: true,
    normalizeDepth: 10,
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate: 0.1,
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/gfc\.weatherboysuper\.com/,
      /^https:\/\/beta-gfc\.weatherboysuper\.com/,
      /^\/api/,
    ],
<<<<<<< HEAD
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
=======
>>>>>>> origin/pr/316
  });
}

initSentry();

export { Sentry };
