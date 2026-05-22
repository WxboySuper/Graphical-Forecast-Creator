import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { areMonitorSettingsEqual, type MonitorSettings } from '../monitor/types';

export const usePremiumMonitorSettingsSync = (settings: MonitorSettings) => {
  const { status, syncedSettings, updateSyncedSettings } = useAuth();
  const { premiumActive } = useEntitlement();
  const lastSyncedRef = useRef<MonitorSettings | null>(syncedSettings?.monitorSettings ?? null);

  useEffect(() => {
    if (syncedSettings?.monitorSettings && !areMonitorSettingsEqual(syncedSettings.monitorSettings, settings)) {
      lastSyncedRef.current = syncedSettings.monitorSettings;
    }
  }, [settings, syncedSettings?.monitorSettings]);

  useEffect(() => {
    if (!premiumActive || status !== 'signed_in') {
      return;
    }

    if (lastSyncedRef.current && areMonitorSettingsEqual(lastSyncedRef.current, settings)) {
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
