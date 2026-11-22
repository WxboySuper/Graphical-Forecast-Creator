/**
 * Local-auth settings helpers. This module defines persisted settings and
 * normalizes account preferences before they enter auth state.
 */
import { serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { DEFAULT_MONITOR_SETTINGS, areSyncedMonitorSettingsEqual, type MonitorSettings } from '../monitor/types';
import { normalizeMonitorSettings } from '../monitor/monitorSettingsNormalize';
import {
  DEFAULT_FORECAST_UI_VARIANT,
  normalizeForecastUiVariant,
  type ForecastUiVariant,
} from '../utils/forecastUiVariant';
import type { OverlaysState } from '../store/overlaysSlice';
import type { OutlookType } from '../types/outlooks';
import {
  toRemoteMonitorSettings,
  toRemoteUserSettingsDocument,
  type RemoteSettingsInput,
} from './userSettingsDocument';

const OUTLOOK_TYPES: readonly OutlookType[] = [
  'tornado',
  'wind',
  'hail',
  'categorical',
  'totalSevere',
  'day4-8',
];

const isSupportedBaseMapStyle = (value: unknown): value is UserSettingsDocument['baseMapStyle'] =>
  value === 'osm' || value === 'esri-satellite' || value === 'blank';

const hasValidGhostOutlooks = (value: unknown): value is UserSettingsDocument['ghostOutlooks'] => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const visibility = value as Record<string, unknown>;
  return OUTLOOK_TYPES.every((outlookType) => typeof visibility[outlookType] === 'boolean');
};

/** The normalized settings document shared by hosted and local auth flows. */
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

/** The local state needed to build a normalized settings document. */
export interface BuildSettingsArgs {
  darkMode: boolean;
  overlays: OverlaysState;
  defaultForecasterName: string;
  forecastUiVariant: ForecastUiVariant;
  monitorSettings?: MonitorSettings;
}

/** The required top-level fields before a remote payload can be normalized. */
type RequiredRemoteSettingsFields = Pick<
  UserSettingsDocument,
  'darkMode' | 'baseMapStyle' | 'stateBorders' | 'counties' | 'ghostOutlooks' | 'defaultForecasterName'
>;

/** Validates required fields and supported values before accepting remote settings. */
const hasRequiredRemoteSettingsFields = (
  value: RemoteSettingsInput,
): value is RequiredRemoteSettingsFields & RemoteSettingsInput => {
  const { darkMode, baseMapStyle, stateBorders, counties, ghostOutlooks, defaultForecasterName } = value;
  return (
    typeof darkMode === 'boolean' &&
    isSupportedBaseMapStyle(baseMapStyle) &&
    typeof stateBorders === 'boolean' &&
    typeof counties === 'boolean' &&
    hasValidGhostOutlooks(ghostOutlooks) &&
    typeof defaultForecasterName === 'string' &&
    defaultForecasterName.length <= 100
  );
};

/** Safely parse the settings fields stored in a remote document. */
export const readRemoteSettings = (value: RemoteSettingsInput | undefined): UserSettingsDocument | null => {
  if (!value) return null;

  if (!hasRequiredRemoteSettingsFields(value)) return null;

  return {
    darkMode: value.darkMode,
    baseMapStyle: value.baseMapStyle,
    stateBorders: value.stateBorders,
    counties: value.counties,
    ghostOutlooks: value.ghostOutlooks,
    defaultForecasterName: value.defaultForecasterName,
    forecastUiVariant: normalizeForecastUiVariant(value.forecastUiVariant) ?? DEFAULT_FORECAST_UI_VARIANT,
    monitorSettings: {
      ...normalizeMonitorSettings(value.monitorSettings),
      mesoscale: DEFAULT_MONITOR_SETTINGS.mesoscale,
    },
  };
};

/** Builds the normalized settings document shape from current local state. */
export const createSettingsSnapshot = (args: BuildSettingsArgs): UserSettingsDocument => {
  const { darkMode, overlays, defaultForecasterName, forecastUiVariant, monitorSettings } = args;
  return {
    darkMode,
    baseMapStyle: overlays.baseMapStyle,
    stateBorders: overlays.stateBorders,
    counties: overlays.counties,
    ghostOutlooks: overlays.ghostOutlooks,
    defaultForecasterName,
    forecastUiVariant,
    monitorSettings: toRemoteMonitorSettings(monitorSettings ?? DEFAULT_MONITOR_SETTINGS) as MonitorSettings,
  };
};

/** Creates the user profile payload written to Firestore on hosted sign-in. */
export const createProfilePayload = (user: User, opts?: { includeCreatedAt?: boolean }) => ({
  email: user.email ?? '',
  displayName: user.displayName ?? '',
  photoURL: user.photoURL ?? '',
  providers: (user.providerData ?? []).map((provider) => provider.providerId),
  updatedAt: serverTimestamp(),
  ...(opts?.includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
});

export { getSettingsSyncError, getSettingsUpdateError } from './authSyncErrors';

/** Builds the payload used when seeding or repairing a remote settings document. */
export const getRemoteSeedPayload = (settings: UserSettingsDocument, opts?: { includeCreatedAt?: boolean }) => ({
  ...toRemoteUserSettingsDocument(settings),
  updatedAt: serverTimestamp(),
  ...(opts?.includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
});

/** Compares hosted settings fields excluding Firestore timestamp metadata. */
const compareUserSettingsFields = (left: UserSettingsDocument, right: UserSettingsDocument): boolean =>
  left.darkMode === right.darkMode &&
  left.baseMapStyle === right.baseMapStyle &&
  left.stateBorders === right.stateBorders &&
  left.counties === right.counties &&
  left.defaultForecasterName === right.defaultForecasterName &&
  left.forecastUiVariant === right.forecastUiVariant &&
  JSON.stringify(left.ghostOutlooks) === JSON.stringify(right.ghostOutlooks) &&
  areSyncedMonitorSettingsEqual(left.monitorSettings, right.monitorSettings);

/** True when two normalized settings payloads contain the same user-visible values. */
export const areUserSettingsEqual = (
  left: UserSettingsDocument | null,
  right: UserSettingsDocument | null,
): boolean => {
  if (!left || !right) return left === right;
  return compareUserSettingsFields(left, right);
};

/** Applies a partial settings patch onto a normalized baseline document. */
export const mergeUserSettingsDocument = (
  base: UserSettingsDocument,
  patch: Partial<UserSettingsDocument>,
): UserSettingsDocument => ({ ...base, ...patch });
