import { serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { DEFAULT_MONITOR_SETTINGS, areMonitorSettingsEqual, type MonitorSettings } from '../monitor/types';
import { normalizeMonitorSettings } from '../monitor/monitorSettingsNormalize';
import {
  DEFAULT_FORECAST_UI_VARIANT,
  normalizeForecastUiVariant,
  type ForecastUiVariant,
} from '../utils/forecastUiVariant';
import type { OverlaysState } from '../store/overlaysSlice';

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

/** The profile fields read by the auth provider. */
export interface UserProfileDocument {
  betaAccess?: boolean;
}

/** The local state needed to build a normalized settings document. */
export interface BuildSettingsArgs {
  darkMode: boolean;
  overlays: OverlaysState;
  defaultForecasterName: string;
  forecastUiVariant: ForecastUiVariant;
  monitorSettings?: MonitorSettings;
}

/** Safely parse the settings fields stored in a remote document. */
export const readRemoteSettings = (value: Partial<UserSettingsDocument> | undefined): UserSettingsDocument | null => {
  if (!value) return null;

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

  if (typeof darkMode !== 'boolean') return null;
  if (typeof stateBorders !== 'boolean' || typeof counties !== 'boolean') return null;
  if (typeof defaultForecasterName !== 'string' || defaultForecasterName.length > 100) return null;
  if (!baseMapStyle || !ghostOutlooks) return null;

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
    monitorSettings: monitorSettings ?? DEFAULT_MONITOR_SETTINGS,
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

/** Reads the current beta-access flag from one hosted profile document snapshot. */
export const readProfileBetaAccess = (value: Partial<UserProfileDocument> | undefined): boolean =>
  Boolean(value?.betaAccess);

/** Normalizes update-write failures into a user-facing sync error message. */
export const getSettingsUpdateError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to update synced settings right now.';

/** Normalizes initial/settings hydration failures into a user-facing sync error message. */
export const getSettingsSyncError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to sync account settings right now.';

/** Builds the payload used when seeding or repairing a remote settings document. */
export const getRemoteSeedPayload = (settings: UserSettingsDocument, opts?: { includeCreatedAt?: boolean }) => ({
  ...settings,
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
  areMonitorSettingsEqual(left.monitorSettings, right.monitorSettings);

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
