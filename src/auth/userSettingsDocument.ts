import type { OverlaysState } from '../store/overlaysSlice';
import type { MonitorSettings } from '../monitor/types';
import { areMonitorSettingsEqual } from '../monitor/types';
import type { ForecastUiVariant } from '../utils/forecastUiVariant';
import {
  DEFAULT_FORECAST_UI_VARIANT,
  normalizeForecastUiVariant,
} from '../utils/forecastUiVariant';
import { normalizeMonitorSettings } from '../monitor/monitorSettingsNormalize';

export interface UserSettingsDocument {
  darkMode: boolean;
  baseMapStyle: OverlaysState['baseMapStyle'];
  stateBorders: boolean;
  counties: boolean;
  ghostOutlooks: OverlaysState['ghostOutlooks'];
  defaultForecasterName: string;
  forecastUiVariant: ForecastUiVariant;
  monitorSettings: MonitorSettings;
}

/** Compares hosted settings fields excluding updatedAt metadata. */
const compareUserSettingsFields = (
  left: UserSettingsDocument,
  right: UserSettingsDocument,
): boolean =>
  left.darkMode === right.darkMode &&
  left.baseMapStyle === right.baseMapStyle &&
  left.stateBorders === right.stateBorders &&
  left.counties === right.counties &&
  left.defaultForecasterName === right.defaultForecasterName &&
  left.forecastUiVariant === right.forecastUiVariant &&
  JSON.stringify(left.ghostOutlooks) === JSON.stringify(right.ghostOutlooks) &&
  areMonitorSettingsEqual(left.monitorSettings, right.monitorSettings);

/** True when two normalized settings payloads contain the same user-visible values. */
export const areUserSettingsEqual = (
  left: UserSettingsDocument | null,
  right: UserSettingsDocument | null,
): boolean => {
  if (!left || !right) {
    return left === right;
  }

  return compareUserSettingsFields(left, right);
};

/** Applies a partial settings patch onto a normalized baseline document. */
export const mergeUserSettingsDocument = (
  base: UserSettingsDocument,
  patch: Partial<UserSettingsDocument>,
): UserSettingsDocument => ({
  ...base,
  ...patch,
});

/** Validates a Firestore settings payload before the app applies it locally. */
export const readRemoteSettings = (
  value: Partial<UserSettingsDocument> | undefined,
): UserSettingsDocument | null => {
  if (!value) {
    return null;
  }

  const {
    darkMode,
    baseMapStyle,
    stateBorders,
    counties,
    ghostOutlooks,
    defaultForecasterName,
    forecastUiVariant,
    monitorSettings,
  } = value;

  if (typeof darkMode !== 'boolean') {
    return null;
  }

  if (typeof stateBorders !== 'boolean' || typeof counties !== 'boolean') {
    return null;
  }

  if (typeof defaultForecasterName !== 'string' || defaultForecasterName.length > 100) {
    return null;
  }

  if (!baseMapStyle || !ghostOutlooks) {
    return null;
  }

  return {
    darkMode,
    baseMapStyle,
    stateBorders,
    counties,
    ghostOutlooks,
    defaultForecasterName,
    forecastUiVariant: normalizeForecastUiVariant(forecastUiVariant) ?? DEFAULT_FORECAST_UI_VARIANT,
    monitorSettings: normalizeMonitorSettings(monitorSettings),
  };
};
