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

function getSentryDsn(): string {
  return typeof __GFC_SENTRY_DSN__ !== 'undefined' ? __GFC_SENTRY_DSN__ : '';
}

/** True when a production DSN was baked into the build (main deploy only). */
export function isSentryEnabled(): boolean {
  return Boolean(getSentryDsn().trim());
}

function getRelease(): string | undefined {
  const version = typeof __GFC_APP_VERSION__ !== 'undefined' ? __GFC_APP_VERSION__ : '';
  return version ? `graphical-forecast-creator@${version}` : undefined;
}

function getEnvironment(): string {
  const configured =
    typeof __GFC_SENTRY_ENVIRONMENT__ !== 'undefined' ? __GFC_SENTRY_ENVIRONMENT__ : '';
  return configured.trim() || 'production';
}

/** Initializes Sentry when a DSN is present. No-op in local dev and beta builds. */
export function initSentry(): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.init({
    dsn: getSentryDsn(),
    environment: getEnvironment(),
    release: getRelease(),
    // Intentional: correlate errors with authenticated sessions (IP/cookies on error events).
    sendDefaultPii: true,
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
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1,
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/gfc\.weatherboysuper\.com/,
      /^\/api/,
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

initSentry();

export { Sentry };
