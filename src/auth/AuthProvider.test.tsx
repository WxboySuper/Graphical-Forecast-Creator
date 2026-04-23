import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { safeParseJson, asRecord, extractLocalUserFromData, createSettingsSnapshot, readRemoteSettings, AuthProvider, useAuth } from './AuthProvider';
import themeReducer from '../store/themeSlice';
import overlaysReducer from '../store/overlaysSlice';
import featureFlagsReducer from '../store/featureFlagsSlice';

interface MockResponse {
  ok: boolean;
  json: () => Promise<Record<string, unknown>>;
  text: () => Promise<string>;
}

// Mock lib/firebase
jest.mock('../lib/firebase', () => ({
  auth: null,
  db: null,
  googleAuthProvider: {},
  isHostedAuthEnabled: false,
  requireAuth: jest.fn(),
  requireDb: jest.fn(),
}));

// Mock productMetrics
jest.mock('../utils/productMetrics', () => ({
  queueProductMetric: jest.fn(),
}));

const createMockStore = () => configureStore({
  reducer: {
    theme: themeReducer,
    overlays: overlaysReducer,
    featureFlags: featureFlagsReducer,
  },
});

describe('AuthProvider Utils', () => {
  test('safeParseJson parses valid JSON', async () => {
    const data = { foo: 'bar' };
    const resp = { ok: true, json: jest.fn().mockResolvedValue(data) } as MockResponse;
    const result = await safeParseJson<{ foo: string }>(resp as unknown as Response);
    expect(result).toEqual(data);
  });

  test('safeParseJson returns null on invalid JSON', async () => {
    const resp = { ok: false, json: jest.fn().mockRejectedValue(new Error('invalid json')) } as MockResponse;
    const result = await safeParseJson(resp as unknown as Response);
    expect(result).toBeNull();
  });

  test('asRecord coerces objects', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord(null)).toEqual({});
    expect(asRecord('string')).toEqual({});
  });

  test('extractLocalUserFromData works', () => {
    const data = { uid: 'user123', email: 'test@example.com', displayName: 'Test User' };
    const user = extractLocalUserFromData(data);
    expect(user.uid).toBe('user123');
    expect(user.email).toBe('test@example.com');
    expect(user.displayName).toBe('Test User');
  });

  test('createSettingsSnapshot builds correct object', () => {
    const overlays = {
      baseMapStyle: 'streets',
      stateBorders: true,
      counties: false,
      ghostOutlooks: {},
    };
    const result = createSettingsSnapshot({
      darkMode: true,
      overlays,
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock',
    });
    expect(result).toEqual({
      darkMode: true,
      baseMapStyle: 'streets',
      stateBorders: true,
      counties: false,
      ghostOutlooks: {},
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock',
    });
  });

  test('readRemoteSettings validates data', () => {
    const validSettings = {
      darkMode: true,
      baseMapStyle: 'streets',
      stateBorders: true,
      counties: false,
      ghostOutlooks: {},
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock' as const,
    };
    expect(readRemoteSettings(validSettings)).toEqual(validSettings);
    expect(readRemoteSettings({ darkMode: 'not boolean' } as Record<string, unknown>)).toBeNull();
    expect(readRemoteSettings()).toBeNull();
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

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <AuthProvider>{children}</AuthProvider>
        </Provider>
      ),
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

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
        ghostOutlooks: {},
        defaultForecasterName: 'Local Hero',
        forecastUiVariant: 'workspace_dock',
      },
      betaAccess: true,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <AuthProvider>{children}</AuthProvider>
        </Provider>
      ),
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

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

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <AuthProvider>{children}</AuthProvider>
        </Provider>
      ),
    });

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

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <AuthProvider>{children}</AuthProvider>
        </Provider>
      ),
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

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

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <AuthProvider>{children}</AuthProvider>
        </Provider>
      ),
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    await act(async () => {
      await result.current.updateSyncedSettings({ darkMode: false });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/local/profile',
      expect.objectContaining({ method: 'GET' })
    );
  });
});