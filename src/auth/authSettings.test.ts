import {
  createProfilePayload,
  createSettingsSnapshot,
  getRemoteSeedPayload,
  mergeUserSettingsDocument,
  readRemoteSettings,
} from './authSettings';
import type { OverlaysState } from '../store/overlaysSlice';

jest.mock('firebase/firestore', () => ({
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
}));

const TEST_OVERLAY_STATE: OverlaysState = {
  baseMapStyle: 'osm',
  stateBorders: true,
  counties: false,
  ghostOutlooks: {
    tornado: false,
    wind: false,
    hail: false,
    categorical: false,
    totalSevere: false,
    'day4-8': false,
  },
  outlookTrimStrategy: 'us-country-minus-great-lakes',
  outlookTrimAutoOnDraw: false,
  outlookTrimPreviewOnly: false,
};

const buildBaseSettings = () =>
  createSettingsSnapshot({
    darkMode: false,
    overlays: { ...TEST_OVERLAY_STATE },
    defaultForecasterName: 'Forecaster',
    forecastUiVariant: 'workspace_dock',
  });

describe('authSettings fallbacks', () => {
  test('unknown forecast variant falls back to the default variant', () => {
    const baseSettings = buildBaseSettings();
    const fallbackSettings = readRemoteSettings({
      ...baseSettings,
      forecastUiVariant: 'unknown-variant',
    } as unknown as Record<string, unknown>);

    expect(fallbackSettings).toEqual(expect.objectContaining({ forecastUiVariant: 'integrated' }));
  });

  test('missing profile fields fall back to empty defaults', () => {
    const minimalPayload = createProfilePayload({} as never);

    expect(minimalPayload).toEqual(expect.objectContaining({ displayName: '', providers: [] }));
  });

  test('seeding without opts timestamps without a creation marker', () => {
    const seedWithoutCreatedAt = getRemoteSeedPayload(buildBaseSettings());

    expect(seedWithoutCreatedAt).toEqual(expect.objectContaining({ updatedAt: expect.anything() }));
    expect(seedWithoutCreatedAt).not.toHaveProperty('createdAt');
  });

  test('partial patches merge without mutating the baseline', () => {
    const baseSettings = buildBaseSettings();
    const merged = mergeUserSettingsDocument(baseSettings, { darkMode: true });

    expect(merged).toEqual(expect.objectContaining({ ...baseSettings, darkMode: true }));
    expect(baseSettings.darkMode).toBe(false);
  });
});
