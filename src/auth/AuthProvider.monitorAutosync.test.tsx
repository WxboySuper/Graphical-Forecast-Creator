import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { getDoc, setDoc } from 'firebase/firestore';
import { AuthProvider, useAuth } from './AuthProvider';
import { createSettingsSnapshot } from './authSettings';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';
import monitorReducer, { setRadarSite } from '../store/monitorSlice';
import overlaysReducer from '../store/overlaysSlice';
import themeReducer from '../store/themeSlice';
import { TEST_OVERLAY_STATE } from './authTestFixtures';

jest.mock('../lib/firebase', () => ({
  auth: {}, db: {}, googleAuthProvider: {}, isHostedAuthEnabled: true,
  requireAuth: jest.fn(), requireDb: jest.fn(() => ({})),
}));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, callback) => {
    callback({ uid: 'user-1', displayName: 'User', email: 'user@example.com', providerData: [] });
    return jest.fn();
  }),
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, collection, id) => ({ collection, id })),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
  serverTimestamp: jest.fn(() => 'timestamp'),
}));
jest.mock('../utils/productMetrics', () => ({ queueProductMetric: jest.fn() }));

test('uploads a monitor change after the hosted settings document has synced', async () => {
  const remoteSettings = createSettingsSnapshot({
    darkMode: false,
    overlays: TEST_OVERLAY_STATE,
    defaultForecasterName: 'Synced Forecaster',
    forecastUiVariant: 'workspace_dock',
    monitorSettings: { ...DEFAULT_MONITOR_SETTINGS, radarSite: 'KTLX' },
  });
  jest.mocked(getDoc).mockImplementation(async (ref) => {
    const collection = (ref as unknown as { collection: string }).collection;
    return {
      exists: () => true,
      data: () => collection === 'userSettings' ? remoteSettings : { createdAt: 'existing' },
    } as never;
  });
  jest.mocked(setDoc).mockResolvedValue(undefined as never);
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  const store = configureStore({ reducer: { theme: themeReducer, overlays: overlaysReducer, monitor: monitorReducer } });
  const { result, unmount } = renderHook(() => useAuth(), {
    wrapper: ({ children }) => <Provider store={store}><AuthProvider>{children}</AuthProvider></Provider>,
  });

  try {
    await waitFor(() => expect(result.current.settingsSyncStatus).toBe('synced'));
    expect(store.getState().monitor.radarSite).toBe('KTLX');
    jest.mocked(setDoc).mockClear();
    jest.useFakeTimers();
    act(() => { store.dispatch(setRadarSite('KOUN')); });
    await act(async () => { await jest.advanceTimersByTimeAsync(750); });
    expect(setDoc).toHaveBeenCalledWith(
      { collection: 'userSettings', id: 'user-1' },
      expect.objectContaining({ monitorSettings: expect.objectContaining({ radarSite: 'KOUN' }) }),
      { merge: true },
    );
    const writtenSettings = jest.mocked(setDoc).mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;
    expect(writtenSettings?.monitorSettings).not.toHaveProperty('mesoscale');
  } finally {
    unmount();
    jest.useRealTimers();
  }
});
