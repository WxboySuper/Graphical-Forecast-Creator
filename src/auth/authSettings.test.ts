import type { User } from 'firebase/auth';
import {
  areUserSettingsEqual,
  createProfilePayload,
  createSettingsSnapshot,
  getRemoteSeedPayload,
  getSettingsSyncError,
  getSettingsUpdateError,
  mergeUserSettingsDocument,
  readProfileBetaAccess,
  readRemoteSettings,
  type UserSettingsDocument,
} from './authSettings';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';
import { DEFAULT_FORECAST_UI_VARIANT, type ForecastUiVariant } from '../utils/forecastUiVariant';
import { TEST_OVERLAY_STATE } from './authTestFixtures';

jest.mock('firebase/firestore', () => ({
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
}));

const buildBaseSettings = (): UserSettingsDocument =>
  createSettingsSnapshot({
    darkMode: false,
    overlays: { ...TEST_OVERLAY_STATE },
    defaultForecasterName: 'Forecaster',
    forecastUiVariant: 'workspace_dock',
  });

const buildUser = (
  overrides: Partial<Pick<User, 'email' | 'displayName' | 'photoURL' | 'providerData'>>,
): User =>
  ({
    email: null,
    displayName: null,
    photoURL: null,
    providerData: [],
    ...overrides,
  }) as User;

describe('readRemoteSettings', () => {
  test('returns null for missing input', () => {
    expect(readRemoteSettings(undefined)).toBeNull();
  });

  test('returns null when required fields are missing', () => {
    expect(readRemoteSettings({ darkMode: true } as Partial<UserSettingsDocument>)).toBeNull();
  });

  test('returns null for wrong field types', () => {
    expect(readRemoteSettings({ darkMode: 'not boolean' } as Partial<UserSettingsDocument>)).toBeNull();
  });

  test('rejects an overlong forecaster name but keeps the 100 character limit', () => {
    const baseSettings = buildBaseSettings();

    expect(
      readRemoteSettings({ ...baseSettings, defaultForecasterName: 'a'.repeat(100) }),
    ).not.toBeNull();
    expect(
      readRemoteSettings({ ...baseSettings, defaultForecasterName: 'a'.repeat(101) }),
    ).toBeNull();
  });

  test('round-trips a valid document', () => {
    const baseSettings = buildBaseSettings();

    expect(readRemoteSettings({ ...baseSettings })).toEqual(baseSettings);
  });

  test('unknown variant falls back to the default variant', () => {
    const fallbackSettings = readRemoteSettings({
      ...buildBaseSettings(),
      forecastUiVariant: 'unknown-variant' as ForecastUiVariant,
    });

    expect(fallbackSettings).toEqual(
      expect.objectContaining({ forecastUiVariant: DEFAULT_FORECAST_UI_VARIANT }),
    );
  });

  test('missing variant falls back to the default variant', () => {
    const baseSettings = buildBaseSettings();
    const { forecastUiVariant: _omitted, ...withoutVariant } = baseSettings;

    expect(readRemoteSettings(withoutVariant)).toEqual(
      expect.objectContaining({ forecastUiVariant: DEFAULT_FORECAST_UI_VARIANT }),
    );
  });

  test('missing monitor settings fall back to defaults', () => {
    const baseSettings = buildBaseSettings();
    const { monitorSettings: _omitted, ...withoutMonitorSettings } = baseSettings;

    expect(readRemoteSettings(withoutMonitorSettings)).toEqual(
      expect.objectContaining({ monitorSettings: DEFAULT_MONITOR_SETTINGS }),
    );
  });
});

describe('createSettingsSnapshot', () => {
  test('builds the normalized document from local state', () => {
    expect(buildBaseSettings()).toEqual({
      darkMode: false,
      baseMapStyle: 'osm',
      stateBorders: true,
      counties: false,
      ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock',
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    });
  });

  test('keeps provided monitor settings instead of defaults', () => {
    const monitorSettings = { ...DEFAULT_MONITOR_SETTINGS, radarMode: 'site' as const };
    const snapshot = createSettingsSnapshot({
      darkMode: true,
      overlays: { ...TEST_OVERLAY_STATE },
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock',
      monitorSettings,
    });

    expect(snapshot.monitorSettings).toEqual(monitorSettings);
  });
});

describe('createProfilePayload', () => {
  test('missing fields fall back to empty defaults', () => {
    expect(createProfilePayload(buildUser({}))).toEqual(
      expect.objectContaining({ email: '', displayName: '', photoURL: '', providers: [] }),
    );
  });

  test('maps provider ids and passes through profile fields', () => {
    const payload = createProfilePayload(
      buildUser({
        email: 'user@example.com',
        displayName: 'Tester',
        photoURL: 'https://example.com/photo.png',
        providerData: [{ providerId: 'password' } as User['providerData'][number]],
      }),
    );

    expect(payload).toEqual(
      expect.objectContaining({
        email: 'user@example.com',
        displayName: 'Tester',
        providers: ['password'],
      }),
    );
  });

  test('only includes createdAt when requested', () => {
    const user = buildUser({ email: 'user@example.com' });

    expect(createProfilePayload(user)).not.toHaveProperty('createdAt');
    expect(createProfilePayload(user, { includeCreatedAt: true })).toEqual(
      expect.objectContaining({ updatedAt: expect.anything(), createdAt: expect.anything() }),
    );
  });
});

describe('readProfileBetaAccess', () => {
  test('reads the beta flag and defaults missing input to false', () => {
    expect(readProfileBetaAccess({ betaAccess: true })).toBe(true);
    expect(readProfileBetaAccess({ betaAccess: false })).toBe(false);
    expect(readProfileBetaAccess({})).toBe(false);
    expect(readProfileBetaAccess(undefined)).toBe(false);
  });
});

describe('settings errors', () => {
  test('passes through error messages and falls back for unknown values', () => {
    expect(getSettingsUpdateError(new Error('Update failed'))).toBe('Update failed');
    expect(getSettingsUpdateError('bad')).toBe('Unable to update synced settings right now.');
    expect(getSettingsSyncError(new Error('Sync failed'))).toBe('Sync failed');
    expect(getSettingsSyncError('bad')).toBe('Unable to sync account settings right now.');
  });
});

describe('getRemoteSeedPayload', () => {
  test('timestamps without a creation marker by default', () => {
    const seedWithoutCreatedAt = getRemoteSeedPayload(buildBaseSettings());

    expect(seedWithoutCreatedAt).toEqual(expect.objectContaining({ updatedAt: expect.anything() }));
    expect(seedWithoutCreatedAt).not.toHaveProperty('createdAt');
  });

  test('includes a creation marker when requested', () => {
    const seed = getRemoteSeedPayload(buildBaseSettings(), { includeCreatedAt: true });

    expect(seed).toEqual(
      expect.objectContaining({ updatedAt: expect.anything(), createdAt: expect.anything() }),
    );
  });
});

describe('areUserSettingsEqual', () => {
  test('handles null baselines', () => {
    const settings = buildBaseSettings();

    expect(areUserSettingsEqual(null, null)).toBe(true);
    expect(areUserSettingsEqual(settings, null)).toBe(false);
    expect(areUserSettingsEqual(null, settings)).toBe(false);
  });

  test('compares normalized field values', () => {
    const settings = buildBaseSettings();

    expect(areUserSettingsEqual(settings, { ...settings })).toBe(true);
    expect(areUserSettingsEqual(settings, { ...settings, darkMode: true })).toBe(false);
    expect(
      areUserSettingsEqual(settings, {
        ...settings,
        ghostOutlooks: { ...settings.ghostOutlooks, tornado: true },
      }),
    ).toBe(false);
    expect(
      areUserSettingsEqual(settings, {
        ...settings,
        monitorSettings: { ...settings.monitorSettings, radarMode: 'site' },
      }),
    ).toBe(false);
  });
});

describe('mergeUserSettingsDocument', () => {
  test('partial patches merge without mutating the baseline', () => {
    const baseSettings = buildBaseSettings();
    const merged = mergeUserSettingsDocument(baseSettings, { darkMode: true });

    expect(merged).toEqual(expect.objectContaining({ ...baseSettings, darkMode: true }));
    expect(baseSettings.darkMode).toBe(false);
  });
});
