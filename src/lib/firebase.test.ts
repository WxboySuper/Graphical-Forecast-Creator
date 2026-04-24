describe('firebase configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    globalThis.__GFC_FIREBASE_API_KEY__ = '';
    globalThis.__GFC_FIREBASE_AUTH_DOMAIN__ = '';
    globalThis.__GFC_FIREBASE_PROJECT_ID__ = '';
    globalThis.__GFC_FIREBASE_APP_ID__ = '';
  });

  test('keeps hosted Firebase disabled when required config is missing', () => {
    jest.isolateModules(() => {
      const firebase = require('./firebase') as typeof import('./firebase');

      expect(firebase.isHostedAuthEnabled).toBe(false);
      expect(firebase.app).toBeNull();
      expect(firebase.auth).toBeNull();
      expect(firebase.db).toBeNull();
      expect(() => firebase.requireAuth()).toThrow(/Firebase auth is not configured/);
      expect(() => firebase.requireDb()).toThrow(/Firestore is not configured/);
    });
  });

  test('initializes hosted Firebase when all config values are present', () => {
    const initializeApp = jest.fn(() => ({ name: 'app' }));
    const getApp = jest.fn(() => ({ name: 'existing' }));
    const getApps = jest.fn(() => []);
    const getAuth = jest.fn(() => ({ name: 'auth' }));
    const getFirestore = jest.fn(() => ({ name: 'db' }));
    const GoogleAuthProvider = jest.fn();

    jest.doMock('firebase/app', () => ({ initializeApp, getApp, getApps }));
    jest.doMock('firebase/auth', () => ({ getAuth, GoogleAuthProvider }));
    jest.doMock('firebase/firestore', () => ({ getFirestore }));

    globalThis.__GFC_FIREBASE_API_KEY__ = 'api';
    globalThis.__GFC_FIREBASE_AUTH_DOMAIN__ = 'auth';
    globalThis.__GFC_FIREBASE_PROJECT_ID__ = 'project';
    globalThis.__GFC_FIREBASE_APP_ID__ = 'app-id';

    jest.isolateModules(() => {
      const firebase = require('./firebase') as typeof import('./firebase');

      expect(firebase.isHostedAuthEnabled).toBe(true);
      expect(initializeApp).toHaveBeenCalledWith({
        apiKey: 'api',
        authDomain: 'auth',
        projectId: 'project',
        appId: 'app-id',
      });
      expect(getAuth).toHaveBeenCalledWith({ name: 'app' });
      expect(getFirestore).toHaveBeenCalledWith({ name: 'app' });
      expect(firebase.requireAuth()).toEqual({ name: 'auth' });
      expect(firebase.requireDb()).toEqual({ name: 'db' });
      expect(GoogleAuthProvider).toHaveBeenCalledTimes(1);
    });
  });
});
