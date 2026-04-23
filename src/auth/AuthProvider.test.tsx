import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import themeReducer from '../store/themeSlice';
import overlaysReducer from '../store/overlaysSlice';
import {
  asRecord,
  AuthProvider,
  createSettingsSnapshot,
  extractLocalUserFromData,
  readRemoteSettings,
  safeParseJson,
  useAuth,
} from './AuthProvider';

const queueProductMetric = jest.fn();
const readStoredForecastUiVariant = jest.fn(() => 'classic');
const writeStoredForecastUiVariant = jest.fn();

jest.mock('../lib/firebase', () => ({
  auth: null,
  db: null,
  googleAuthProvider: {},
  isHostedAuthEnabled: false,
  requireAuth: () => {
    throw new Error('not configured');
  },
  requireDb: () => {
    throw new Error('not configured');
  },
}));

jest.mock('../utils/productMetrics', () => ({
  queueProductMetric: (...args: unknown[]) => queueProductMetric(...args),
}));

jest.mock('../utils/forecastUiVariant', () => ({
  DEFAULT_FORECAST_UI_VARIANT: 'classic',
  normalizeForecastUiVariant: (value: unknown) =>
    value === 'compact' || value === 'classic' ? value : null,
  readStoredForecastUiVariant: () => readStoredForecastUiVariant(),
  writeStoredForecastUiVariant: (...args: unknown[]) => writeStoredForecastUiVariant(...args),
}));

const createStore = () =>
  configureStore({
    reducer: {
      theme: themeReducer,
      overlays: overlaysReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

const jsonResponse = <T,>(ok: boolean, body: T): Response =>
  ({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as unknown as Response);

const AuthProbe = () => {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="status">{auth.status}</div>
      <div data-testid="syncStatus">{auth.settingsSyncStatus}</div>
      <div data-testid="error">{auth.error ?? ''}</div>
      <div data-testid="beta">{String(auth.betaAccess)}</div>
      <div data-testid="betaLoading">{String(auth.betaAccessLoading)}</div>
      <button
        type="button"
        onClick={() => {
          auth.signInWithEmail('test@example.com', 'secret').catch(() => undefined);
        }}
      >
        signIn
      </button>
      <button
        type="button"
        onClick={() => {
          auth.signUpWithEmail('test@example.com', 'secret').catch(() => undefined);
        }}
      >
        signUp
      </button>
      <button
        type="button"
        onClick={() => {
          auth.signOutUser().catch(() => undefined);
        }}
      >
        signOut
      </button>
      <button
        type="button"
        onClick={() => {
          auth.refreshBetaAccess().catch(() => undefined);
        }}
      >
        refreshBeta
      </button>
      <button
        type="button"
        onClick={() => {
          auth.updateSyncedSettings({ defaultForecasterName: 'Tester' }).catch(() => undefined);
        }}
      >
        updateSettings
      </button>
    </div>
  );
};

describe('AuthProvider helpers', () => {
  it('safeParseJson returns parsed value or null on parse failure', async () => {
    const okResp = { json: async () => ({ a: 1 }) } as Response;
    const badResp = { json: async () => Promise.reject(new Error('bad')) } as unknown as Response;
    await expect(safeParseJson(okResp)).resolves.toEqual({ a: 1 });
    await expect(safeParseJson(badResp)).resolves.toBeNull();
  });

  it('asRecord/extractLocalUserFromData normalize unknown data safely', () => {
    expect(asRecord(null)).toEqual({});
    expect(extractLocalUserFromData({ uid: 'u1', email: 'a@b.c', displayName: 'Name' })).toEqual({
      uid: 'u1',
      email: 'a@b.c',
      displayName: 'Name',
      providerData: [],
    });
    expect(extractLocalUserFromData({})).toMatchObject({
      uid: 'local',
      email: '',
      displayName: '',
    });
  });

  it('createSettingsSnapshot/readRemoteSettings build and validate settings payloads', () => {
    const snapshot = createSettingsSnapshot({
      darkMode: true,
      overlays: {
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
      },
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'compact',
    });
    expect(snapshot.defaultForecasterName).toBe('Forecaster');
    expect(readRemoteSettings(snapshot)?.forecastUiVariant).toBe('compact');
    expect(
      readRemoteSettings({
        ...snapshot,
        darkMode: 'nope' as unknown as boolean,
      })
    ).toBeNull();
  });

  it('useAuth throws when used outside provider', () => {
    const BadConsumer = () => {
      useAuth();
      return null;
    };
    expect(() => render(<BadConsumer />)).toThrow('useAuth must be used within AuthProvider');
  });
});

describe('AuthProvider local mode', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const renderWithStore = () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </Provider>
    );
  };

  it('initializes as signed_out when local profile endpoint is unauthenticated', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(false, { message: 'not signed in' }));

    renderWithStore();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('signed_out');
      expect(screen.getByTestId('syncStatus')).toHaveTextContent('idle');
    });
  });

  it('signs in and signs up through local endpoints and emits metrics', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(false, { message: 'not signed in' }))
      .mockResolvedValueOnce(
        jsonResponse(true, {
          uid: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
          betaAccess: true,
          settings: {
            darkMode: false,
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
            defaultForecasterName: 'Test User',
            forecastUiVariant: 'classic',
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(true, {
          uid: 'user-2',
          email: 'new@example.com',
          displayName: 'New User',
          betaAccess: false,
          settings: {
            darkMode: true,
            baseMapStyle: 'carto-light',
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
            defaultForecasterName: 'New User',
            forecastUiVariant: 'compact',
          },
        })
      );

    renderWithStore();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed_out'));

    await act(async () => {
      fireEvent.click(screen.getByText('signIn'));
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed_in'));

    await act(async () => {
      fireEvent.click(screen.getByText('signUp'));
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed_in'));

    expect(queueProductMetric).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'account_signin' })
    );
    expect(queueProductMetric).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'account_signup' })
    );
    expect(writeStoredForecastUiVariant).toHaveBeenCalled();
  });

  it('handles refresh, settings update, and signout flows in local mode', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse(true, {
          uid: 'user-1',
          email: 'test@example.com',
          displayName: 'Test User',
          betaAccess: false,
          settings: {
            darkMode: false,
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
            defaultForecasterName: 'Test User',
            forecastUiVariant: 'classic',
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse(true, { betaAccess: true }))
      .mockResolvedValueOnce(
        jsonResponse(true, {
          settings: {
            darkMode: true,
            baseMapStyle: 'carto-dark',
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
            defaultForecasterName: 'Tester',
            forecastUiVariant: 'compact',
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse(true, {}));

    renderWithStore();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed_in'));

    await act(async () => {
      fireEvent.click(screen.getByText('refreshBeta'));
    });
    await waitFor(() => expect(screen.getByTestId('beta')).toHaveTextContent('true'));

    await act(async () => {
      fireEvent.click(screen.getByText('updateSettings'));
    });
    await waitFor(() => expect(screen.getByTestId('syncStatus')).toHaveTextContent('synced'));

    await act(async () => {
      fireEvent.click(screen.getByText('signOut'));
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed_out'));
  });
});
