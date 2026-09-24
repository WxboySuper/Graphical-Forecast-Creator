import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  applySettingsToState,
  areOverlaySettingsEqual,
  asRecord,
  canSyncHostedUserDocuments,
  clearDeletedAccountSession,
  disabledAuthAction,
  extractLocalUserFromData,
  getDefaultContextValue,
  initLocalAuthState,
  localRefreshBetaAccess,
  localSignInWithEmail,
  localSignOutUser,
  localSignUpWithEmail,
  localUpdateSyncedSettings,
  postLocalJson,
  runInitialHostedSync,
  attachHostedSettingsSubscription,
  safeParseJson,
  seedOrApplySettings,
  startSettingsSubscription,
  syncProfileDocument,
  createSettingsSnapshot as createProviderSettingsSnapshot,
  areUserSettingsEqual as areProviderUserSettingsEqual,
  createProfilePayload as createProviderProfilePayload,
  getRemoteSeedPayload as getProviderRemoteSeedPayload,
  getSettingsSyncError as getProviderSettingsSyncError,
  getSettingsUpdateError as getProviderSettingsUpdateError,
  mergeUserSettingsDocument as mergeProviderUserSettingsDocument,
  readProfileBetaAccess as readProviderProfileBetaAccess,
  readRemoteSettings as readProviderRemoteSettings,
  AuthProvider,
  useAuth,
} from './AuthProvider';
import { queueProductMetric } from '../utils/productMetrics';
import {
  attachHostedSettingsSubscription as attachHostedDirect,
  runInitialHostedSync as runInitialHostedDirect,
  seedOrApplySettings as seedHostedDirect,
  startSettingsSubscription as startHostedDirect,
  syncProfileDocument as syncHostedDirect,
} from './authHostedSettings';
import {
  asRecord as asRecordDirect,
  extractLocalUserFromData as extractLocalUserDirect,
  postLocalJson as postLocalJsonDirect,
  safeParseJson as safeParseJsonDirect,
} from './authLocalTransport';
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
} from './authSettings';
import themeReducer from '../store/themeSlice';
import overlaysReducer from '../store/overlaysSlice';
import monitorReducer from '../store/monitorSlice';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';
import { TEST_OVERLAY_STATE } from './authTestFixtures';

// Mock lib/firebase
jest.mock('../lib/firebase', () => ({
  auth: null,
  db: null,
  googleAuthProvider: {},
  isHostedAuthEnabled: false,
  requireAuth: jest.fn(),
  requireDb: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...path) => ({ path })),
  getDoc: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
  setDoc: jest.fn(),
}));

// Mock productMetrics
jest.mock('../utils/productMetrics', () => ({
  queueProductMetric: jest.fn(),
}));

const createMockStore = () => configureStore({
  reducer: {
    theme: themeReducer,
    overlays: overlaysReducer,
    monitor: monitorReducer,
  },
});

const renderAuthHookWithStore = (store: ReturnType<typeof createMockStore>) =>
  renderHook(() => useAuth(), {
    wrapper: ({ children }) => (
      <Provider store={store}>
        <AuthProvider>{children}</AuthProvider>
      </Provider>
    ),
  });

const waitForAuthEffects = async (delay = 100) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, delay));
  });
};

describe('AuthProvider Utils', () => {
  test('keeps the existing provider re-export for settings helpers', () => {
    expect(createProviderSettingsSnapshot).toBe(createSettingsSnapshot);
    expect(areProviderUserSettingsEqual).toBe(areUserSettingsEqual);
    expect(createProviderProfilePayload).toBe(createProfilePayload);
    expect(getProviderRemoteSeedPayload).toBe(getRemoteSeedPayload);
    expect(getProviderSettingsSyncError).toBe(getSettingsSyncError);
    expect(getProviderSettingsUpdateError).toBe(getSettingsUpdateError);
    expect(mergeProviderUserSettingsDocument).toBe(mergeUserSettingsDocument);
    expect(readProviderProfileBetaAccess).toBe(readProfileBetaAccess);
    expect(readProviderRemoteSettings).toBe(readRemoteSettings);
  });

  test('local sign-out failure does not turn completed server deletion into a failure', async () => {
    const clearLocalState = jest.fn();
    await expect(clearDeletedAccountSession(
      async () => { throw new Error('local storage unavailable'); },
      clearLocalState,
    ))
      .resolves.toBeUndefined();
    expect(clearLocalState).toHaveBeenCalledTimes(1);
  });

  test('re-exports the local transport seam from the extracted module', () => {
    expect(asRecord).toBe(asRecordDirect);
    expect(extractLocalUserFromData).toBe(extractLocalUserDirect);
    expect(postLocalJson).toBe(postLocalJsonDirect);
    expect(safeParseJson).toBe(safeParseJsonDirect);
  });

  test('overlay comparison and application helpers avoid redundant dispatches', () => {
    const overlays = { ...TEST_OVERLAY_STATE };
    const settings = createSettingsSnapshot({
      darkMode: false,
      overlays,
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock',
    });

    expect(areOverlaySettingsEqual(overlays, settings)).toBe(true);
    expect(areOverlaySettingsEqual({ ...overlays, counties: true }, settings)).toBe(false);

    const dispatch = jest.fn();
    const setSyncedSettings = jest.fn();
    const lastSyncedSettingsRef = { current: null };
    applySettingsToState(
      { ...settings, darkMode: true, counties: true },
      {
        currentDarkModeRef: { current: false },
        currentOverlaysRef: { current: overlays },
        dispatch,
        setSyncedSettings,
        lastSyncedSettingsRef,
      }
    );

    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(setSyncedSettings).toHaveBeenCalledWith(expect.objectContaining({ darkMode: true, counties: true }));

    expect(lastSyncedSettingsRef.current).not.toBeNull();
    const syncedSettings = lastSyncedSettingsRef.current;
    if (!syncedSettings) {
      throw new Error('Expected synced settings to be populated');
    }
    applySettingsToState(syncedSettings, {
      currentDarkModeRef: { current: true },
      currentOverlaysRef: { current: { ...overlays, counties: true } },
      dispatch,
      setSyncedSettings,
      lastSyncedSettingsRef,
    });
    expect(setSyncedSettings).toHaveBeenCalledTimes(1);
  });

  test('auth utility fallbacks normalize errors', () => {
    expect(() => disabledAuthAction()).toThrow(/Hosted accounts are not enabled/);
    expect(getDefaultContextValue()).toEqual(expect.objectContaining({ status: 'disabled', hostedAuthEnabled: false }));
    expect(canSyncHostedUserDocuments(null)).toBe(false);
  });

  test('local auth action helpers update state and surface failures', async () => {
    const overlays = { ...TEST_OVERLAY_STATE };
    const deps = {
      dispatch: jest.fn(),
      currentDarkModeRef: { current: false },
      currentOverlaysRef: { current: overlays },
      setUser: jest.fn(),
      setStatus: jest.fn(),
      setSyncedSettings: jest.fn(),
      setSettingsSyncStatus: jest.fn(),
      lastSyncedSettingsRef: { current: null },
      setBetaAccess: jest.fn(),
      setBetaAccessLoading: jest.fn(),
      setError: jest.fn(),
    };

    const localPayload = {
      uid: 'user-1',
      email: 'user@example.com',
      betaAccess: true,
      settings: {
        darkMode: false,
        baseMapStyle: 'osm',
        stateBorders: true,
        counties: false,
        ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
        defaultForecasterName: 'Local',
        forecastUiVariant: 'workspace_dock',
        monitorSettings: DEFAULT_MONITOR_SETTINGS,
      },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(localPayload),
    });
    await localSignInWithEmail({ email: 'user@example.com', password: 'secret' }, deps);
    expect(global.fetch).toHaveBeenCalledWith('/api/local/signin', expect.objectContaining({ method: 'POST' }));
    expect(deps.setStatus).toHaveBeenCalledWith('signed_in');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Bad password' }),
    });
    await expect(localSignInWithEmail({ email: 'user@example.com', password: 'bad' }, deps)).rejects.toThrow('Bad password');
    expect(deps.setError).toHaveBeenCalledWith('Bad password');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(localPayload),
    });
    await localSignUpWithEmail({ email: 'new@example.com', password: 'secret' }, deps);
    expect(global.fetch).toHaveBeenCalledWith('/api/local/signup', expect.objectContaining({ method: 'POST' }));

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await localSignOutUser(deps);
    expect(deps.setUser).toHaveBeenCalledWith(null);
    expect(deps.setStatus).toHaveBeenCalledWith('signed_out');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ betaAccess: true }),
    });
    await localRefreshBetaAccess(deps);
    expect(deps.setBetaAccess).toHaveBeenCalledWith(true);

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    await localRefreshBetaAccess(deps);
    expect(deps.setBetaAccess).toHaveBeenCalledWith(false);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ settings: localPayload.settings }),
    });
    await localUpdateSyncedSettings({ defaultForecasterName: 'Updated' }, deps);
    expect(deps.setSettingsSyncStatus).toHaveBeenCalledWith('synced');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Update failed' }),
    });
    await expect(localUpdateSyncedSettings({ defaultForecasterName: 'Nope' }, deps)).rejects.toThrow('Update failed');
    expect(deps.setError).toHaveBeenCalledWith('Update failed');
  });

  test('initializes local auth from profile success, inactive state, and failures', async () => {
    const makeDeps = (isActive = () => true) => ({
      isActive,
      dispatch: jest.fn(),
      currentDarkModeRef: { current: false },
      currentOverlaysRef: {
        current: TEST_OVERLAY_STATE,
      },
      setUser: jest.fn(),
      setStatus: jest.fn(),
      setSettingsSyncStatus: jest.fn(),
      setSyncedSettings: jest.fn(),
      lastSyncedSettingsRef: { current: null },
      setError: jest.fn(),
      setBetaAccess: jest.fn(),
      setBetaAccessLoading: jest.fn(),
    });

    const profile = {
      uid: 'local-user',
      email: 'local@example.com',
      betaAccess: true,
      settings: {
        darkMode: false,
        baseMapStyle: 'osm',
        stateBorders: true,
        counties: false,
        ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
        defaultForecasterName: 'Local',
        forecastUiVariant: 'workspace_dock',
        monitorSettings: DEFAULT_MONITOR_SETTINGS,
      },
    };

    const successDeps = makeDeps();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(profile),
    });
    await initLocalAuthState(successDeps);
    expect(successDeps.setUser).toHaveBeenCalledWith(expect.objectContaining({ uid: 'local-user' }));
    expect(successDeps.setStatus).toHaveBeenCalledWith('signed_in');
    expect(successDeps.setSettingsSyncStatus).toHaveBeenCalledWith('synced');
    expect(successDeps.setBetaAccess).toHaveBeenCalledWith(true);

    const inactiveDeps = makeDeps(() => false);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(profile),
    });
    await initLocalAuthState(inactiveDeps);
    expect(inactiveDeps.setUser).not.toHaveBeenCalled();

    const signedOutDeps = makeDeps();
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    await initLocalAuthState(signedOutDeps);
    expect(signedOutDeps.setStatus).toHaveBeenCalledWith('signed_out');
    expect(signedOutDeps.setSettingsSyncStatus).toHaveBeenCalledWith('idle');
    expect(signedOutDeps.setBetaAccessLoading).toHaveBeenCalledWith(false);

    const errorDeps = makeDeps();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await initLocalAuthState(errorDeps);
    expect(errorDeps.setStatus).toHaveBeenCalledWith('error');
    expect(errorDeps.setError).toHaveBeenCalledWith('offline');
  });

  test('syncProfileDocument includes createdAt when the profile is new', async () => {
    const getDocSpy = jest.mocked(getDoc);
    const setDocSpy = jest.mocked(setDoc).mockResolvedValue(undefined as never);

    getDocSpy.mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    } as never);
    await syncProfileDocument({ path: 'profile' } as never, {
      email: 'user@example.com',
      displayName: 'User',
      photoURL: '',
      providerData: [],
    } as never);
    expect(setDocSpy).toHaveBeenCalledWith(
      { path: 'profile' },
      expect.objectContaining({ email: 'user@example.com', createdAt: expect.anything() }),
      { merge: true }
    );
  });

  test('syncProfileDocument preserves the creation timestamp on an existing profile', async () => {
    const getDocSpy = jest.mocked(getDoc);
    const setDocSpy = jest.mocked(setDoc).mockResolvedValue(undefined as never);

    getDocSpy.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ createdAt: { __serverTimestamp: true } }),
    } as never);
    await syncProfileDocument({ path: 'profile' } as never, {
      email: 'user@example.com',
      displayName: 'User',
      photoURL: '',
      providerData: [],
    } as never);
    expect(setDocSpy).toHaveBeenCalledWith(
      { path: 'profile' },
      expect.objectContaining({
        email: 'user@example.com',
        displayName: 'User',
        photoURL: '',
        providers: [],
        updatedAt: expect.anything(),
      }),
      { merge: true }
    );
    expect(setDocSpy.mock.calls.at(-1)?.[1]).not.toHaveProperty('createdAt');
  });

  test('syncProfileDocument backfills createdAt on a legacy profile missing it', async () => {
    const getDocSpy = jest.mocked(getDoc);
    const setDocSpy = jest.mocked(setDoc).mockResolvedValue(undefined as never);

    getDocSpy.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ email: 'user@example.com' }),
    } as never);
    await syncProfileDocument({ path: 'profile' } as never, {
      email: 'user@example.com',
      displayName: 'User',
      photoURL: '',
      providerData: [],
    } as never);
    expect(setDocSpy).toHaveBeenCalledWith(
      { path: 'profile' },
      expect.objectContaining({ email: 'user@example.com', createdAt: expect.anything() }),
      { merge: true }
    );
  });

  test('seedOrApplySettings reuses the remote settings when present', async () => {
    const settings = {
      darkMode: false,
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
      defaultForecasterName: 'Remote',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    const applyRemoteSettings = jest.fn();
    const setSyncedSettings = jest.fn();
    const lastSyncedSettingsRef = { current: null };
    jest.mocked(setDoc).mockClear();

    await seedOrApplySettings({
      settingsRef: { path: 'settings' } as never,
      settingsSnapshot: { data: () => settings, exists: () => true } as never,
      localSettings: { ...settings, defaultForecasterName: 'Local' },
      applyRemoteSettings,
      isActive: () => true,
      lastSyncedSettingsRef,
      setSyncedSettings,
    });
    expect(applyRemoteSettings).toHaveBeenCalledWith(settings);
    expect(setDoc).not.toHaveBeenCalled();
  });

  test('seedOrApplySettings seeds Firestore when the settings are missing', async () => {
    const settings = {
      darkMode: false,
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
      defaultForecasterName: 'Remote',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    const setDocSpy = jest.mocked(setDoc).mockResolvedValue(undefined as never);
    const applyRemoteSettings = jest.fn();
    const setSyncedSettings = jest.fn();
    const lastSyncedSettingsRef = { current: null };

    await seedOrApplySettings({
      settingsRef: { path: 'settings' } as never,
      settingsSnapshot: { data: () => undefined, exists: () => false } as never,
      localSettings: settings,
      applyRemoteSettings,
      isActive: () => true,
      lastSyncedSettingsRef,
      setSyncedSettings,
    });
    expect(setDocSpy).toHaveBeenCalledWith(
      { path: 'settings' },
      expect.objectContaining({ defaultForecasterName: 'Remote', createdAt: expect.anything() }),
      { merge: true }
    );
    expect(setSyncedSettings).toHaveBeenCalledWith(settings);
  });

  test('startSettingsSubscription applies snapshots, normalizes errors, and unsubscribes', async () => {
    const settings = {
      darkMode: false,
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
      defaultForecasterName: 'Remote',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    const onSnapshotSpy = jest.mocked(onSnapshot);
    const applyRemoteSettings = jest.fn();
    let snapshotHandler: ((snapshot: { data: () => typeof settings }) => void) | null = null;
    let errorHandler: ((error: Error) => void) | null = null;
    const unsubscribe = jest.fn();
    onSnapshotSpy.mockImplementation((ref, next, error) => {
      snapshotHandler = next as typeof snapshotHandler;
      errorHandler = error as typeof errorHandler;
      return unsubscribe;
    });
    const setSettingsSyncStatus = jest.fn();
    const setError = jest.fn();
    const subscription = startSettingsSubscription({
      settingsRef: { path: 'settings' } as never,
      isActive: () => true,
      applyRemoteSettings,
      setSettingsSyncStatus,
      setError,
    });
    expect(snapshotHandler).not.toBeNull();
    if (!snapshotHandler) {
      throw new Error('Expected snapshot handler to be registered');
    }
    snapshotHandler({ data: () => settings });
    expect(setSettingsSyncStatus).toHaveBeenCalledWith('synced');
    expect(errorHandler).not.toBeNull();
    if (!errorHandler) {
      throw new Error('Expected error handler to be registered');
    }
    errorHandler(new Error('listener failed'));
    expect(setError).toHaveBeenCalledWith('listener failed');
    subscription();
    expect(unsubscribe).toHaveBeenCalled();
  });

  test('runInitialHostedSync syncs the profile, seeds settings, and subscribes', async () => {
    const settings = {
      darkMode: false,
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
      defaultForecasterName: 'Remote',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    const getDocSpy = jest.mocked(getDoc);
    getDocSpy
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ email: 'user@example.com', createdAt: { __serverTimestamp: true } }),
      } as never)
      .mockResolvedValueOnce({ data: () => undefined, exists: () => false } as never);
    const applyRemoteSettings = jest.fn();
    const setSyncedSettings = jest.fn();
    const lastSyncedSettingsRef = { current: null };
    const setSettingsSyncStatus = jest.fn();
    const setError = jest.fn();
    const hasInitializedSettingsRef = { current: false };
    const unsubscribeResult = await runInitialHostedSync({
      profileRef: { path: 'profile' } as never,
      settingsRef: { path: 'settings' } as never,
      user: { uid: 'user-1', email: 'user@example.com', displayName: 'User', photoURL: '', providerData: [] } as never,
      buildLocalSettingsSnapshot: () => settings,
      applyRemoteSettings,
      isActive: () => true,
      lastSyncedSettingsRef,
      setSyncedSettings,
      setSettingsSyncStatus,
      setError,
      hasInitializedSettingsRef,
    });
    expect(hasInitializedSettingsRef.current).toBe(true);
    expect(setSettingsSyncStatus).toHaveBeenCalledWith('syncing');
    expect(setSettingsSyncStatus).toHaveBeenCalledWith('synced');
    expect(typeof unsubscribeResult).toBe('function');
  });

  test('runInitialHostedSync applies live subscription snapshots while active', async () => {
    const seedSettings = {
      darkMode: false,
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
      defaultForecasterName: 'Local',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    const liveSettings = {
      ...seedSettings,
      defaultForecasterName: 'Live',
    };
    const getDocSpy = jest.mocked(getDoc);
    getDocSpy.mockClear();
    getDocSpy
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ email: 'user@example.com', createdAt: { __serverTimestamp: true } }),
      } as never)
      .mockResolvedValueOnce({ data: () => undefined, exists: () => false } as never);
    const setDocSpy = jest.mocked(setDoc);
    setDocSpy.mockClear();
    setDocSpy.mockResolvedValue(undefined as never);
    const onSnapshotSpy = jest.mocked(onSnapshot);
    onSnapshotSpy.mockClear();
    const liveUnsubscribe = jest.fn();
    let liveNext: ((snapshot: { data: () => unknown }) => void) | undefined;
    onSnapshotSpy.mockImplementation((_ref, next) => {
      liveNext = next as (snapshot: { data: () => unknown }) => void;
      return liveUnsubscribe;
    });

    const applyRemoteSettings = jest.fn();
    const setSettingsSyncStatus = jest.fn();
    const setError = jest.fn();
    const hasInitializedSettingsRef = { current: false };
    const unsubscribeResult = await runInitialHostedSync({
      profileRef: { path: 'profile' } as never,
      settingsRef: { path: 'settings' } as never,
      user: { uid: 'user-1', email: 'user@example.com', displayName: 'User', photoURL: '', providerData: [] } as never,
      buildLocalSettingsSnapshot: () => seedSettings,
      applyRemoteSettings,
      isActive: () => true,
      lastSyncedSettingsRef: { current: null },
      setSyncedSettings: jest.fn(),
      setSettingsSyncStatus,
      setError,
      hasInitializedSettingsRef,
    });

    expect(unsubscribeResult).toBe(liveUnsubscribe);
    expect(hasInitializedSettingsRef.current).toBe(true);
    expect(setSettingsSyncStatus).toHaveBeenCalledWith('synced');
    expect(setError).not.toHaveBeenCalled();
    if (!liveNext) {
      throw new Error('Expected live subscription handler to be registered');
    }
    liveNext({ data: () => liveSettings });
    expect(applyRemoteSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultForecasterName: 'Live' }));
    expect(setSettingsSyncStatus).toHaveBeenCalledWith('synced');
    expect(hasInitializedSettingsRef.current).toBe(true);
  });

  test('cleans up a listener that resolves after hosted settings cleanup', async () => {
    const unsubscribe = jest.fn();
    const setSubscription = jest.fn();
    let active = true;

    const subscriptionPromise = Promise.resolve(unsubscribe);
    const handoff = attachHostedSettingsSubscription(subscriptionPromise, () => active, setSubscription);
    active = false;

    await handoff;

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(setSubscription).not.toHaveBeenCalled();
  });

  test('re-exports the hosted settings seam from the extracted module', () => {
    expect(attachHostedSettingsSubscription).toBe(attachHostedDirect);
    expect(runInitialHostedSync).toBe(runInitialHostedDirect);
    expect(seedOrApplySettings).toBe(seedHostedDirect);
    expect(startSettingsSubscription).toBe(startHostedDirect);
    expect(syncProfileDocument).toBe(syncHostedDirect);
  });

  test('seedOrApplySettings skips writes and state when inactive', async () => {
    const settings = {
      darkMode: false,
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
      defaultForecasterName: 'Local',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    const setDocSpy = jest.mocked(setDoc);
    setDocSpy.mockClear();
    setDocSpy.mockResolvedValue(undefined as never);

    const applyRemoteSettings = jest.fn();
    const setSyncedSettings = jest.fn();
    const lastSyncedSettingsRef = { current: null };

    await seedOrApplySettings({
      settingsRef: { path: 'settings' } as never,
      settingsSnapshot: { data: () => settings, exists: () => true } as never,
      localSettings: settings,
      applyRemoteSettings,
      isActive: () => false,
      lastSyncedSettingsRef,
      setSyncedSettings,
    });
    expect(applyRemoteSettings).not.toHaveBeenCalled();
    expect(setDocSpy).not.toHaveBeenCalled();

    await seedOrApplySettings({
      settingsRef: { path: 'settings' } as never,
      settingsSnapshot: { data: () => undefined, exists: () => false } as never,
      localSettings: settings,
      applyRemoteSettings,
      isActive: (() => {
        let calls = 0;
        return () => {
          calls += 1;
          return calls === 1;
        };
      })(),
      lastSyncedSettingsRef,
      setSyncedSettings,
    });
    expect(setDocSpy).toHaveBeenCalledTimes(1);
    expect(lastSyncedSettingsRef.current).toBeNull();
    expect(setSyncedSettings).not.toHaveBeenCalled();
  });

  test('startSettingsSubscription ignores inactive and invalid snapshots and errors', () => {
    const settings = {
      darkMode: false,
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
      defaultForecasterName: 'Remote',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    const onSnapshotSpy = jest.mocked(onSnapshot);
    const captured: {
      next?: (snapshot: { data: () => unknown }) => void;
      error?: (error: Error) => void;
    } = {};
    onSnapshotSpy.mockImplementation((ref, next, error) => {
      captured.next = next as unknown as (snapshot: { data: () => unknown }) => void;
      captured.error = error as unknown as (error: Error) => void;
      return jest.fn();
    });

    const applyRemoteSettings = jest.fn();
    const setSettingsSyncStatus = jest.fn();
    const setError = jest.fn();
    let active = false;
    startSettingsSubscription({
      settingsRef: { path: 'settings' } as never,
      isActive: () => active,
      applyRemoteSettings,
      setSettingsSyncStatus,
      setError,
    });
    if (!captured.next || !captured.error) {
      throw new Error('Expected subscription handlers to be registered');
    }
    const handleSnapshot = captured.next;
    const handleError = captured.error;
    handleSnapshot({ data: () => settings });
    handleError(new Error('stale listener failed'));
    expect(applyRemoteSettings).not.toHaveBeenCalled();
    expect(setSettingsSyncStatus).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();

    active = true;
    handleSnapshot({ data: () => ({ darkMode: 'not boolean' }) });
    expect(applyRemoteSettings).not.toHaveBeenCalled();
    expect(setSettingsSyncStatus).not.toHaveBeenCalled();
  });

  test('runInitialHostedSync stays idle when the effect goes inactive', async () => {
    const settings = {
      darkMode: false,
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
      defaultForecasterName: 'Local',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    const getDocSpy = jest.mocked(getDoc);
    getDocSpy
      .mockResolvedValueOnce({ exists: () => false, data: () => undefined } as never)
      .mockResolvedValueOnce({ data: () => undefined, exists: () => false } as never);
    const setDocSpy = jest.mocked(setDoc);
    setDocSpy.mockClear();
    setDocSpy.mockResolvedValue(undefined as never);
    const onSnapshotSpy = jest.mocked(onSnapshot);
    onSnapshotSpy.mockClear();

    const setSettingsSyncStatus = jest.fn();
    const setError = jest.fn();
    const hasInitializedSettingsRef = { current: false };
    const result = await runInitialHostedSync({
      profileRef: { path: 'profile' } as never,
      settingsRef: { path: 'settings' } as never,
      user: { uid: 'user-1' } as never,
      buildLocalSettingsSnapshot: () => settings,
      applyRemoteSettings: jest.fn(),
      isActive: () => false,
      lastSyncedSettingsRef: { current: null },
      setSyncedSettings: jest.fn(),
      setSettingsSyncStatus,
      setError,
      hasInitializedSettingsRef,
    });

    expect(result).toBeUndefined();
    expect(hasInitializedSettingsRef.current).toBe(false);
    expect(setSettingsSyncStatus).toHaveBeenCalledWith('syncing');
    expect(setSettingsSyncStatus).not.toHaveBeenCalledWith('synced');
    expect(setSettingsSyncStatus).not.toHaveBeenCalledWith('error');
    expect(setError).not.toHaveBeenCalled();
    expect(onSnapshotSpy).not.toHaveBeenCalled();
  });

  test('runInitialHostedSync reports errors only while active', async () => {
    const getDocSpy = jest.mocked(getDoc);
    getDocSpy.mockRejectedValueOnce(new Error('profile offline'));

    const activeStatus = jest.fn();
    const activeError = jest.fn();
    const activeResult = await runInitialHostedSync({
      profileRef: { path: 'profile' } as never,
      settingsRef: { path: 'settings' } as never,
      user: { uid: 'user-1' } as never,
      buildLocalSettingsSnapshot: () => {
        throw new Error('unreachable');
      },
      applyRemoteSettings: jest.fn(),
      isActive: () => true,
      lastSyncedSettingsRef: { current: null },
      setSyncedSettings: jest.fn(),
      setSettingsSyncStatus: activeStatus,
      setError: activeError,
      hasInitializedSettingsRef: { current: false },
    });
    expect(activeResult).toBeUndefined();
    expect(activeStatus).toHaveBeenCalledWith('syncing');
    expect(activeStatus).toHaveBeenCalledWith('error');
    expect(activeError).toHaveBeenCalledWith('profile offline');

    getDocSpy.mockRejectedValueOnce(new Error('profile offline'));
    const idleStatus = jest.fn();
    const idleError = jest.fn();
    const idleResult = await runInitialHostedSync({
      profileRef: { path: 'profile' } as never,
      settingsRef: { path: 'settings' } as never,
      user: { uid: 'user-1' } as never,
      buildLocalSettingsSnapshot: () => {
        throw new Error('unreachable');
      },
      applyRemoteSettings: jest.fn(),
      isActive: () => false,
      lastSyncedSettingsRef: { current: null },
      setSyncedSettings: jest.fn(),
      setSettingsSyncStatus: idleStatus,
      setError: idleError,
      hasInitializedSettingsRef: { current: false },
    });
    expect(idleResult).toBeUndefined();
    expect(idleStatus).toHaveBeenCalledWith('syncing');
    expect(idleStatus).not.toHaveBeenCalledWith('error');
    expect(idleError).not.toHaveBeenCalled();
  });

  test('hands off an active subscription and propagates late rejections', async () => {
    const unsubscribe = jest.fn();
    const setSubscription = jest.fn();

    await attachHostedSettingsSubscription(Promise.resolve(unsubscribe), () => true, setSubscription);
    expect(setSubscription).toHaveBeenCalledWith(unsubscribe);
    expect(unsubscribe).not.toHaveBeenCalled();

    const noopSubscription = jest.fn();
    await attachHostedSettingsSubscription(Promise.resolve(undefined), () => true, noopSubscription);
    expect(noopSubscription).not.toHaveBeenCalled();

    const rejectedSubscription = jest.fn();
    await expect(
      attachHostedSettingsSubscription(Promise.reject(new Error('late handoff')), () => true, rejectedSubscription),
    ).rejects.toThrow('late handoff');
    expect(rejectedSubscription).not.toHaveBeenCalled();

    await attachHostedSettingsSubscription(Promise.resolve(undefined), () => false, jest.fn());
  });
});

describe('AuthProvider local credential edge cases', () => {
  const makeCredentialDeps = () => ({
    dispatch: jest.fn(),
    currentDarkModeRef: { current: false },
    currentOverlaysRef: { current: { ...TEST_OVERLAY_STATE } },
    setUser: jest.fn(),
    setStatus: jest.fn(),
    setSyncedSettings: jest.fn(),
    setSettingsSyncStatus: jest.fn(),
    lastSyncedSettingsRef: { current: null },
    setBetaAccess: jest.fn(),
    setBetaAccessLoading: jest.fn(),
    setError: jest.fn(),
  });

  const fetchMock = () => global.fetch as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test('maps sign-up HTTP failures to user-facing errors', async () => {
    const deps = makeCredentialDeps();
    fetchMock()
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ message: 'Email taken' }) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.reject(new Error('bad json')) });

    await expect(localSignUpWithEmail({ email: 'taken@example.com', password: 'secret' }, deps)).rejects.toThrow(
      'Email taken',
    );
    expect(deps.setError).toHaveBeenCalledWith('Email taken');

    await expect(localSignUpWithEmail({ email: 'taken@example.com', password: 'secret' }, deps)).rejects.toThrow(
      'Sign up failed',
    );
    expect(deps.setError).toHaveBeenCalledWith('Sign up failed');
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(fetchMock()).toHaveBeenNthCalledWith(1, '/api/local/signup', expect.objectContaining({ method: 'POST' }));
  });

  test('tolerates malformed JSON on successful sign-in and sign-up', async () => {
    const signInDeps = makeCredentialDeps();
    const signUpDeps = makeCredentialDeps();
    fetchMock()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new Error('bad json')) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new Error('bad json')) });

    await localSignInWithEmail({ email: 'user@example.com', password: 'secret' }, signInDeps);
    expect(signInDeps.setStatus).toHaveBeenCalledWith('signed_in');
    expect(signInDeps.setUser).toHaveBeenCalledWith(expect.objectContaining({ uid: 'local' }));
    expect(signInDeps.setError).toHaveBeenCalledWith(null);

    await localSignUpWithEmail({ email: 'new@example.com', password: 'secret' }, signUpDeps);
    expect(signUpDeps.setStatus).toHaveBeenCalledWith('signed_in');
    expect(signUpDeps.setUser).toHaveBeenCalledWith(expect.objectContaining({ uid: 'local' }));
    expect(signUpDeps.setError).toHaveBeenCalledWith(null);
  });

  test('dispatches exact product metrics for sign-in and sign-up', async () => {
    const metric = jest.mocked(queueProductMetric);
    const signInDeps = makeCredentialDeps();
    const signUpDeps = makeCredentialDeps();
    const signInPayload = { uid: 'metric-signin', email: 'signin@example.com', displayName: 'Sign In' };
    const signUpPayload = { uid: 'metric-signup', email: 'signup@example.com', displayName: 'Sign Up' };
    fetchMock()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(signInPayload) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(signUpPayload) });

    await localSignInWithEmail({ email: 'signin@example.com', password: 'secret' }, signInDeps);
    expect(metric).toHaveBeenCalledWith({
      event: 'account_signin',
      user: { uid: 'metric-signin', email: 'signin@example.com', displayName: 'Sign In', providerData: [] },
    });

    await localSignUpWithEmail({ email: 'signup@example.com', password: 'secret' }, signUpDeps);
    expect(metric).toHaveBeenCalledWith({
      event: 'account_signup',
      user: { uid: 'metric-signup', email: 'signup@example.com', displayName: 'Sign Up', providerData: [] },
    });
    expect(metric).toHaveBeenCalledTimes(2);
  });

  test('clears a stale error when a retry starts', async () => {
    const deps = makeCredentialDeps();
    fetchMock()
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ message: 'Bad password' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ uid: 'user-1', email: 'user@example.com', displayName: 'User' }),
      });

    await expect(localSignInWithEmail({ email: 'user@example.com', password: 'bad' }, deps)).rejects.toThrow(
      'Bad password',
    );
    await localSignInWithEmail({ email: 'user@example.com', password: 'good' }, deps);

    expect(deps.setError.mock.calls[0]).toEqual([null]);
    expect(deps.setError.mock.calls[1]).toEqual(['Bad password']);
    expect(deps.setError.mock.calls[2]).toEqual([null]);
    expect(deps.setStatus).toHaveBeenCalledWith('signed_in');
  });
});

describe('AuthProvider Local Auth', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });
  });

  test('initializes as signed_out if local profile fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { result } = renderAuthHookWithStore(store);

    await waitForAuthEffects(0);

    expect(result.current.status).toBe('signed_out');
  });

  test('initializes as signed_in if local profile succeeds', async () => {
    const mockUser = {
      uid: 'local-user',
      email: 'local@example.com',
      settings: {
        darkMode: true,
        baseMapStyle: 'satellite',
        stateBorders: true,
        counties: true,
        ghostOutlooks: TEST_OVERLAY_STATE.ghostOutlooks,
        defaultForecasterName: 'Local Hero',
        forecastUiVariant: 'workspace_dock',
        monitorSettings: DEFAULT_MONITOR_SETTINGS,
      },
      betaAccess: true,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const { result } = renderAuthHookWithStore(store);

    await waitForAuthEffects();

    expect(result.current.status).toBe('signed_in');
    expect(result.current.user?.uid).toBe('local-user');
  });

  test('signUpWithEmail calls /api/local/signup', async () => {
    const mockUser = { uid: 'user2', email: 'user2@example.com' };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      });

    const { result } = renderAuthHookWithStore(store);

    await act(async () => {
      await result.current.signUpWithEmail('user2@example.com', 'password');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/local/signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user2@example.com', password: 'password' }),
      })
    );
    expect(result.current.status).toBe('signed_in');
  });

  test('signOutUser calls /api/local/signout', async () => {
    const mockUser = { uid: 'user1', email: 'user1@example.com' };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUser) })
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderAuthHookWithStore(store);

    await waitForAuthEffects();

    expect(result.current.status).toBe('signed_in');

    await act(async () => {
      await result.current.signOutUser();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/local/signout',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.current.status).toBe('signed_out');
  });

  test('updateSyncedSettings calls /api/local/profile in local mode', async () => {
    const mockUser = { uid: 'user1', email: 'user1@example.com' };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUser) })
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderAuthHookWithStore(store);

    await waitForAuthEffects();

    await act(async () => {
      await result.current.updateSyncedSettings({ darkMode: false });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/local/profile',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
