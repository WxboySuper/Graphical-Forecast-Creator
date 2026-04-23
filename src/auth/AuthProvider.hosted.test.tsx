import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import * as AuthProviderModule from './AuthProvider';
import themeReducer from '../store/themeSlice';
import overlaysReducer from '../store/overlaysSlice';
import featureFlagsReducer from '../store/featureFlagsSlice';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { onSnapshot, getDoc, setDoc, doc } from 'firebase/firestore';

const {
  AuthProvider,
  useAuth,
} = AuthProviderModule;

// Mock lib/firebase to ENABLE hosted auth
jest.mock('../lib/firebase', () => ({
  auth: { currentUser: null },
  db: {},
  googleAuthProvider: {},
  isHostedAuthEnabled: true,
  requireAuth: jest.fn(() => ({})),
  requireDb: jest.fn(() => ({})),
}));

// Mock firebase/auth
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signInWithPopup: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  getAdditionalUserInfo: jest.fn(() => ({ isNewUser: false })),
  GoogleAuthProvider: jest.fn(),
}));

// Mock firebase/firestore
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(() => ({ id: 'mock-doc' })),
  onSnapshot: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'mock-timestamp'),
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

describe('AuthProvider Hosted Auth', () => {
  let store: any;

  beforeEach(() => {
    store = createMockStore();
    jest.clearAllMocks();
  });

  test('initializes as signed_in when firebase user exists', async () => {
    const mockFirebaseUser = {
      uid: 'firebase-user-123',
      email: 'fire@example.com',
      displayName: 'Fire User',
      getIdToken: jest.fn().mockResolvedValue('token'),
    };

    (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
      callback(mockFirebaseUser);
      return jest.fn(); // unsubscribe
    });

    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        darkMode: true,
        baseMapStyle: 'streets',
        stateBorders: true,
        counties: true,
        ghostOutlooks: {},
        defaultForecasterName: 'Fire Hero',
        forecastUiVariant: 'workspace_dock',
      }),
    });

    (onSnapshot as jest.Mock).mockReturnValue(jest.fn());

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <AuthProvider>{children}</AuthProvider>
        </Provider>
      ),
    });

    // Wait for effects
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(result.current.status).toBe('signed_in');
    expect(result.current.user?.uid).toBe('firebase-user-123');
    expect(onSnapshot).toHaveBeenCalled();
  });

  test('signOutUser calls firebase signOut', async () => {
    const mockFirebaseUser = {
      uid: 'user1',
      getIdToken: jest.fn().mockResolvedValue('token'),
    };
    (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
      callback(mockFirebaseUser);
      return jest.fn();
    });
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
    (setDoc as jest.Mock).mockResolvedValue({});
    (onSnapshot as jest.Mock).mockReturnValue(jest.fn());

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <AuthProvider>{children}</AuthProvider>
        </Provider>
      ),
    });

    await act(async () => {
      await result.current.signOutUser();
    });

    expect(signOut).toHaveBeenCalled();
  });

  test('signInWithGoogle calls signInWithPopup', async () => {
    (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
      callback(null);
      return jest.fn();
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <AuthProvider>{children}</AuthProvider>
        </Provider>
      ),
    });

    const mockCredential = { user: { uid: 'google-user' } };
    (signInWithPopup as jest.Mock).mockResolvedValue(mockCredential);

    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(signInWithPopup).toHaveBeenCalled();
  });
});
