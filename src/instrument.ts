import * as Sentry from '@sentry/react';
import type { Event, EventHint } from '@sentry/react';
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

const IGNORED_ERROR_MESSAGES = [
  /^(NetworkError: )?A network error occurred\.?$/i,
  /^(AbortError: )?The user aborted a request\.?$/i,
];

/** Returns the Sentry DSN baked in at build time, or an empty string when monitoring is off. */
function getSentryDsn(): string {
  return typeof __GFC_SENTRY_DSN__ !== 'undefined' ? __GFC_SENTRY_DSN__ : '';
}

/** True when a DSN was baked into the build (hosted production or beta deploys). */
export function isSentryEnabled(): boolean {
  return Boolean(getSentryDsn().trim());
}

/** Returns the Sentry release string derived from the app version, when available. */
function getRelease(): string | undefined {
  const version = typeof __GFC_APP_VERSION__ !== 'undefined' ? __GFC_APP_VERSION__ : '';
  return version ? `graphical-forecast-creator@${version}` : undefined;
}

/** Returns the configured Sentry environment label (production, beta, etc.). */
function getEnvironment(): string {
  const configured =
    typeof __GFC_SENTRY_ENVIRONMENT__ !== 'undefined' ? __GFC_SENTRY_ENVIRONMENT__ : '';
  return configured.trim() || 'production';
}

/** Drops no-stack request lifecycle noise while preserving actionable stacked errors. */
export function beforeSend(event: Event, _hint: EventHint): Event | null {
  const values = event.exception?.values ?? [];
  const message = values[0]?.value ?? event.message ?? '';
  const hasStackFrames = values.some((value) => (value.stacktrace?.frames?.length ?? 0) > 0);
  const isIgnoredRequestNoise = IGNORED_ERROR_MESSAGES.some((pattern) => pattern.test(message));

  return isIgnoredRequestNoise && !hasStackFrames ? null : event;
}

/** Initializes Sentry when a DSN is present. No-op in local dev without a DSN. */
export function initSentry(): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.init({
    dsn: getSentryDsn(),
    tunnel: '/api/sentry-tunnel',
    environment: getEnvironment(),
    release: getRelease(),
    sendDefaultPii: false,
    enableLogs: true,
    normalizeDepth: 10,
    beforeSend,
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
  });
}

initSentry();

export { Sentry };
