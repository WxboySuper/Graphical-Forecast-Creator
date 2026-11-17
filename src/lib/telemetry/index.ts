import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

export type TelemetryConsent = 'granted' | 'denied' | 'unset';
export const TELEMETRY_CONSENT_KEY = 'gfc-telemetry-consent';
const LEGACY_CONSENT_KEY = 'gfc-analytics-enabled';
const ACTIVE_DAY_KEY = 'gfc-telemetry-active-day';
const DEFAULT_TELEMETRY_BASE_URL = 'https://telemetry.gfcweather.com';

export const TELEMETRY_EVENTS = [
  'page_view', 'forecast_created', 'forecast_exported', 'forecast_shared',
  'forecast_saved_cloud', 'mesoscale_layer_opened', 'verification_used',
  'map_layer_changed', 'premium_feature_used', 'error_shown',
] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];
const eventSet = new Set<string>(TELEMETRY_EVENTS);
const DETAIL_PATTERN = /^[A-Za-z0-9 _:./-]{1,80}$/;
let visitPingSent = false;
let failedStorageConsent: TelemetryConsent | null = null;

const readStoredConsent = (): TelemetryConsent => {
  if (failedStorageConsent) return failedStorageConsent;
  try {
    if (typeof localStorage === 'undefined') return 'unset';
    const current = localStorage.getItem(TELEMETRY_CONSENT_KEY);
    if (current === 'granted' || current === 'denied' || current === 'unset') return current;
    const legacy = localStorage.getItem(LEGACY_CONSENT_KEY);
    if (legacy !== null) {
      const migrated = legacy === 'true' ? 'granted' : 'unset';
      localStorage.setItem(TELEMETRY_CONSENT_KEY, migrated);
      localStorage.removeItem(LEGACY_CONSENT_KEY);
      return migrated;
    }
  } catch {
    return 'unset';
  }
  return 'unset';
};

export const getTelemetryConsent = (): TelemetryConsent => readStoredConsent();

export const setTelemetryConsent = (value: TelemetryConsent): void => {
  if (value !== 'granted' && value !== 'denied' && value !== 'unset') return;
  try {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, value);
    localStorage.removeItem(LEGACY_CONSENT_KEY);
    failedStorageConsent = null;
  } catch {
    failedStorageConsent = value === 'granted' ? 'unset' : value;
  }
};

export const useTelemetryConsent = (): [TelemetryConsent, (value: TelemetryConsent) => void] => {
  const [state, setState] = useState<TelemetryConsent>(() => getTelemetryConsent());
  const updateState = useCallback((value: TelemetryConsent) => {
    setTelemetryConsent(value);
    setState(getTelemetryConsent());
  }, []);

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key === TELEMETRY_CONSENT_KEY || event.key === LEGACY_CONSENT_KEY || event.key === null) {
        failedStorageConsent = null;
        setState(getTelemetryConsent());
      }
    };
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  return [state, updateState];
};

const telemetryBaseUrl = (): string => {
  try {
    return (typeof __GFC_TELEMETRY_BASE_URL__ === 'string' && __GFC_TELEMETRY_BASE_URL__)
      ? __GFC_TELEMETRY_BASE_URL__.replace(/\/$/, '')
      : DEFAULT_TELEMETRY_BASE_URL;
  } catch {
    return DEFAULT_TELEMETRY_BASE_URL;
  }
};

const post = (path: string, body?: string, token?: string): void => {
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(`${telemetryBaseUrl()}${path}`, {
      method: 'POST',
      headers,
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Telemetry never blocks product work.
  }
};

export const trackEvent = (event: TelemetryEvent, detail?: string): void => {
  if (getTelemetryConsent() !== 'granted' || !eventSet.has(event)) return;
  if (detail !== undefined && (typeof detail !== 'string' || !DETAIL_PATTERN.test(detail))) return;
  const payload: { event: TelemetryEvent; detail?: string; version: string } = {
    event,
    version: typeof __GFC_APP_VERSION__ === 'string' ? __GFC_APP_VERSION__ : 'unknown',
  };
  if (detail !== undefined) payload.detail = detail;
  post('/v1/event', JSON.stringify(payload));
};

export const pingVisit = (): void => {
  if (visitPingSent) return;
  visitPingSent = true;
  post('/v1/visit');
};

export const pingDailyActive = (user: User | null | undefined): void => {
  if (!user) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(ACTIVE_DAY_KEY) === day) return;
    localStorage.setItem(ACTIVE_DAY_KEY, day);
    void user.getIdToken().then((token) => post('/v1/active', undefined, token)).catch(() => undefined);
  } catch {
    // No token or no local storage means no active ping.
  }
};

export const pageNameForPath = (pathname: string): string => {
  const path = pathname.split(/[?#]/, 1)[0];
  if (path === '/') return 'home';
  if (path.startsWith('/forecast/')) return path === '/forecast/mesoscale' ? 'mesoscale' : 'forecast';
  if (path === '/forecast') return 'forecast';
  if (path.startsWith('/discussion')) return 'discussion';
  if (path === '/verification') return 'verification';
  if (path === '/monitor') return 'monitor';
  if (path === '/account') return 'account';
  if (path === '/cloud') return 'cloud';
  if (path === '/admin') return 'admin';
  if (path === '/pricing') return 'pricing';
  if (path === '/updates') return 'updates';
  return 'other';
};
