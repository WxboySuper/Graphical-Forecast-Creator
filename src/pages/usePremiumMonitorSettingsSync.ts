import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { areMonitorSettingsEqual, type MonitorSettings } from '../monitor/types';

const shouldSyncPremiumMonitorSettings = (
  premiumActive: boolean,
  status: string,
  lastSynced: MonitorSettings | null,
  settings: MonitorSettings,
): boolean =>
  premiumActive &&
  status === 'signed_in' &&
  (!lastSynced || !areMonitorSettingsEqual(lastSynced, settings));

export const usePremiumMonitorSettingsSync = (settings: MonitorSettings) => {
  const { status, syncedSettings, updateSyncedSettings } = useAuth();
  const { premiumActive } = useEntitlement();
  const lastSyncedRef = useRef<MonitorSettings | null>(syncedSettings?.monitorSettings ?? null);

  useEffect(() => {
    if (syncedSettings?.monitorSettings) {
      lastSyncedRef.current = syncedSettings.monitorSettings;
    }
  }, [syncedSettings?.monitorSettings]);

  useEffect(() => {
    if (!shouldSyncPremiumMonitorSettings(premiumActive, status, lastSyncedRef.current, settings)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lastSyncedRef.current = settings;
      updateSyncedSettings({ monitorSettings: settings }).catch(() => {
        lastSyncedRef.current = null;
      });
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [premiumActive, settings, status, updateSyncedSettings]);
};
