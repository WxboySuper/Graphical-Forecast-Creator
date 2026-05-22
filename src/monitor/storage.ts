import { DEFAULT_MONITOR_SETTINGS, MonitorSettings, normalizeMonitorSettings } from './types';

export const MONITOR_SETTINGS_STORAGE_KEY = 'gfc-monitor-settings';

export const readStoredMonitorSettings = (): MonitorSettings => {
  try {
    const storedValue = localStorage.getItem(MONITOR_SETTINGS_STORAGE_KEY);
    if (!storedValue) {
      return DEFAULT_MONITOR_SETTINGS;
    }

    return normalizeMonitorSettings(JSON.parse(storedValue));
  } catch {
    return DEFAULT_MONITOR_SETTINGS;
  }
};

export const writeStoredMonitorSettings = (settings: MonitorSettings): void => {
  try {
    localStorage.setItem(MONITOR_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Keep monitor controls usable if localStorage is blocked or full.
  }
};
