import { useCallback, useEffect, useState } from 'react';

export type TelemetryConsent = 'granted' | 'denied' | 'unset';
export const TELEMETRY_CONSENT_KEY = 'gfc-telemetry-consent';
const LEGACY_CONSENT_KEY = 'gfc-analytics-enabled';
let failedStorageConsent: TelemetryConsent | null = null;

const isTelemetryConsent = (value: string | null): value is TelemetryConsent =>
  value === 'granted' || value === 'denied' || value === 'unset';

const canReadBrowserStorage = (): boolean => typeof localStorage !== 'undefined';

const readCurrentConsent = (): TelemetryConsent | null => {
  if (!canReadBrowserStorage()) return null;
  const stored = localStorage.getItem(TELEMETRY_CONSENT_KEY);
  return isTelemetryConsent(stored) ? stored : null;
};

const migrateLegacyConsent = (): TelemetryConsent => {
  const legacy = localStorage.getItem(LEGACY_CONSENT_KEY);
  if (legacy === null) return 'unset';
  const migrated: TelemetryConsent = legacy === 'true' ? 'granted' : 'unset';
  localStorage.setItem(TELEMETRY_CONSENT_KEY, migrated);
  localStorage.removeItem(LEGACY_CONSENT_KEY);
  return migrated;
};

export const getTelemetryConsent = (): TelemetryConsent => {
  if (failedStorageConsent) return failedStorageConsent;
  try {
    return readCurrentConsent() ?? migrateLegacyConsent();
  } catch {
    return 'unset';
  }
};

const isWritableConsent = (value: unknown): value is TelemetryConsent =>
  value === 'granted' || value === 'denied' || value === 'unset';

export const setTelemetryConsent = (value: TelemetryConsent): void => {
  if (!isWritableConsent(value)) return;
  try {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, value);
    localStorage.removeItem(LEGACY_CONSENT_KEY);
    failedStorageConsent = null;
  } catch {
    failedStorageConsent = value === 'granted' ? 'unset' : value;
  }
};

const isConsentStorageEvent = (key: string | null): boolean =>
  key === TELEMETRY_CONSENT_KEY || key === LEGACY_CONSENT_KEY || key === null;

export const useTelemetryConsent = (): [TelemetryConsent, (value: TelemetryConsent) => void] => {
  const [state, setState] = useState<TelemetryConsent>(() => getTelemetryConsent());
  const updateState = useCallback((value: TelemetryConsent) => {
    setTelemetryConsent(value);
    setState(getTelemetryConsent());
  }, []);

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (!isConsentStorageEvent(event.key)) return;
      failedStorageConsent = null;
      setState(getTelemetryConsent());
    };
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  return [state, updateState];
};
