import type { OverlaysState } from '../store/overlaysSlice';
import { normalizeBaseMapStyle, type LegacyBaseMapStyle } from '../store/overlaysSlice';
import type { OutlookType } from '../types/outlooks';
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

const BASE_MAP_STYLES = new Set(['osm', 'esri-satellite', 'blank', 'carto-light', 'carto-dark']);
const OUTLOOK_TYPES: OutlookType[] = [
  'tornado',
  'wind',
  'hail',
  'categorical',
  'totalSevere',
  'day4-8',
];

const readBooleanField = (value: unknown): value is boolean => typeof value === 'boolean';

const readDefaultForecasterName = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 100;

const readBaseMapStyle = (value: unknown): UserSettingsDocument['baseMapStyle'] | null => {
  if (typeof value !== 'string' || !BASE_MAP_STYLES.has(value)) {
    return null;
  }
  return normalizeBaseMapStyle(value as UserSettingsDocument['baseMapStyle'] | LegacyBaseMapStyle);
};

const readGhostOutlooks = (value: unknown): UserSettingsDocument['ghostOutlooks'] | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !OUTLOOK_TYPES.includes(key as OutlookType))
    || OUTLOOK_TYPES.some((key) => typeof record[key] !== 'boolean')
  ) {
    return null;
  }
  return record as UserSettingsDocument['ghostOutlooks'];
};

const USER_SETTINGS_FIELD_READERS: {
  key: keyof UserSettingsDocument;
  read: (partial: Partial<UserSettingsDocument>) => UserSettingsDocument[keyof UserSettingsDocument] | null;
}[] = [
  {
    key: 'darkMode',
    read: (partial) => (readBooleanField(partial.darkMode) ? partial.darkMode : null),
  },
  {
    key: 'stateBorders',
    read: (partial) => (readBooleanField(partial.stateBorders) ? partial.stateBorders : null),
  },
  {
    key: 'counties',
    read: (partial) => (readBooleanField(partial.counties) ? partial.counties : null),
  },
  {
    key: 'defaultForecasterName',
    read: (partial) => (readDefaultForecasterName(partial.defaultForecasterName)
      ? partial.defaultForecasterName
      : null),
  },
  {
    key: 'baseMapStyle',
    read: (partial) => readBaseMapStyle(partial.baseMapStyle),
  },
  {
    key: 'ghostOutlooks',
    read: (partial) => readGhostOutlooks(partial.ghostOutlooks),
  },
  {
    key: 'forecastUiVariant',
    read: (partial) =>
      normalizeForecastUiVariant(partial.forecastUiVariant) ?? DEFAULT_FORECAST_UI_VARIANT,
  },
  {
    key: 'monitorSettings',
    read: (partial) => normalizeMonitorSettings(partial.monitorSettings),
  },
];

/** Validates a Firestore settings payload before the app applies it locally. */
export const readRemoteSettings = (
  value: Partial<UserSettingsDocument> | undefined,
  fallback?: UserSettingsDocument,
): UserSettingsDocument | null => {
  if (!value) {
    return null;
  }

  const document = {} as UserSettingsDocument;
  for (const { key, read } of USER_SETTINGS_FIELD_READERS) {
    const fieldValue = read(value);
    if (fieldValue === null && !fallback) {
      return null;
    }
    document[key] = (fieldValue ?? fallback?.[key]) as never;
  }

  return document;
};
