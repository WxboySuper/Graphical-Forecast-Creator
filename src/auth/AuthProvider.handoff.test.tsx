import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { AuthProvider, useAuth } from './AuthProvider';
import { runInitialHostedSync } from './authHostedSettings';
import themeReducer from '../store/themeSlice';
import overlaysReducer from '../store/overlaysSlice';
import monitorReducer from '../store/monitorSlice';

const mockUser = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  photoURL: null,
  providerData: [],
} as never;

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
  getAdditionalUserInfo: jest.fn(),
  onAuthStateChanged: jest.fn((_auth: unknown, next: (user: unknown) => void) => {
    next(mockUser);
    return jest.fn();
  }),
  reauthenticateWithCredential: jest.fn(),
  reauthenticateWithPopup: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
  googleAuthProvider: {},
  isHostedAuthEnabled: true,
  requireAuth: jest.fn(() => ({})),
  requireDb: jest.fn(() => ({})),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...path: unknown[]) => ({ path })),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => true, data: () => ({}) })),
  onSnapshot: jest.fn(() => jest.fn()),
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
  setDoc: jest.fn(() => Promise.resolve()),
}));

jest.mock('./authHostedSettings', () => {
  const actual = jest.requireActual('./authHostedSettings');
  return {
    ...actual,
    runInitialHostedSync: jest.fn(() => Promise.reject(new Error('late handoff'))),
  };
});

jest.mock('../utils/productMetrics', () => ({
  queueProductMetric: jest.fn(),
}));

const createMockStore = () =>
  configureStore({
    reducer: {
      theme: themeReducer,
      overlays: overlaysReducer,
      monitor: monitorReducer,
    },
  });

describe('AuthProvider hosted handoff rejection', () => {
  test('reports a late subscription rejection instead of surfacing an unhandled rejection', async () => {
    const store = createMockStore();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const onUnhandled = jest.fn();
    process.on('unhandledRejection', onUnhandled);

    try {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => (
          <Provider store={store}>
            <AuthProvider>{children}</AuthProvider>
          </Provider>
        ),
      });

      await waitFor(() => {
        expect(result.current.settingsSyncStatus).toBe('error');
      });
      await waitFor(() => {
        expect(result.current.error).toBe('late handoff');
      });

      expect(runInitialHostedSync).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        'Hosted settings subscription handoff failed:',
        expect.any(Error),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
      consoleError.mockRestore();
    }
  });
});
