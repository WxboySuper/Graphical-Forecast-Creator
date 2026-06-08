describe('firebase configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    globalThis.__GFC_FIREBASE_API_KEY__ = '';
    globalThis.__GFC_FIREBASE_AUTH_DOMAIN__ = '';
    globalThis.__GFC_FIREBASE_PROJECT_ID__ = '';
    globalThis.__GFC_FIREBASE_APP_ID__ = '';
  });

  test('keeps hosted Firebase disabled when required config is missing', async () => {
    await jest.isolateModulesAsync(async () => {
      const firebase = await import('./firebase');

      expect(firebase.isHostedAuthEnabled).toBe(false);
      expect(firebase.app).toBeNull();
      expect(firebase.auth).toBeNull();
      expect(firebase.db).toBeNull();
      expect(() => firebase.requireAuth()).toThrow(/Firebase auth is not configured/);
      expect(() => firebase.requireDb()).toThrow(/Firestore is not configured/);
    });
  });

  test('initializes hosted Firebase when all config values are present', async () => {
    const initializeApp = jest.fn(() => ({ name: 'app' }));
    const getApp = jest.fn(() => ({ name: 'existing' }));
    const getApps = jest.fn(() => []);
    const getAuth = jest.fn(() => ({ name: 'auth' }));
    const setPersistence = jest.fn(() => Promise.resolve());
    const browserLocalPersistence = { kind: 'browser-local' };
    const initializeFirestore = jest.fn(() => ({ name: 'db' }));
    const getFirestore = jest.fn(() => ({ name: 'should-not-call' }));
    const memoryLocalCache = jest.fn(() => ({ kind: 'memory' }));
    const GoogleAuthProvider = jest.fn();

    jest.doMock('firebase/app', () => ({ initializeApp, getApp, getApps }));
    jest.doMock('firebase/auth', () => ({
      getAuth,
      GoogleAuthProvider,
      setPersistence,
      browserLocalPersistence,
    }));
    jest.doMock('firebase/firestore', () => ({
      initializeFirestore,
      getFirestore,
      memoryLocalCache,
    }));

    globalThis.__GFC_FIREBASE_API_KEY__ = 'api';
    globalThis.__GFC_FIREBASE_AUTH_DOMAIN__ = 'auth';
    globalThis.__GFC_FIREBASE_PROJECT_ID__ = 'project';
    globalThis.__GFC_FIREBASE_APP_ID__ = 'app-id';

    await jest.isolateModulesAsync(async () => {
      const firebase = await import('./firebase');

      expect(firebase.isHostedAuthEnabled).toBe(true);
      expect(initializeApp).toHaveBeenCalledWith({
        apiKey: 'api',
        authDomain: 'auth',
        projectId: 'project',
        appId: 'app-id',
      });
      expect(getAuth).toHaveBeenCalledWith({ name: 'app' });
      expect(setPersistence).toHaveBeenCalledWith(
        { name: 'auth' },
        browserLocalPersistence
      );
      expect(memoryLocalCache).toHaveBeenCalledTimes(1);
      expect(initializeFirestore).toHaveBeenCalledWith(
        { name: 'app' },
        { localCache: { kind: 'memory' } }
      );
      expect(firebase.requireAuth()).toEqual({ name: 'auth' });
      expect(firebase.requireDb()).toEqual({ name: 'db' });
      expect(GoogleAuthProvider).toHaveBeenCalledTimes(1);
      expect(getFirestore).not.toHaveBeenCalled();
    });
  });

  test('reuses existing Firestore when initializeFirestore was already called', async () => {
    const initializeApp = jest.fn(() => ({ name: 'app' }));
    const getApp = jest.fn(() => ({ name: 'existing' }));
    const getApps = jest.fn(() => [{ name: 'existing' }]);
    const getAuth = jest.fn(() => ({ name: 'auth' }));
    const setPersistence = jest.fn(() => Promise.resolve());
    const browserLocalPersistence = { kind: 'browser-local' };
    const initializeFirestore = jest.fn(() => {
      throw new Error('Firestore has already been initialized');
    });
    const getFirestore = jest.fn(() => ({ name: 'existing-db' }));
    const memoryLocalCache = jest.fn(() => ({ kind: 'memory' }));
    const GoogleAuthProvider = jest.fn();

    jest.doMock('firebase/app', () => ({ initializeApp, getApp, getApps }));
    jest.doMock('firebase/auth', () => ({
      getAuth,
      GoogleAuthProvider,
      setPersistence,
      browserLocalPersistence,
    }));
    jest.doMock('firebase/firestore', () => ({
      initializeFirestore,
      getFirestore,
      memoryLocalCache,
    }));

    globalThis.__GFC_FIREBASE_API_KEY__ = 'api';
    globalThis.__GFC_FIREBASE_AUTH_DOMAIN__ = 'auth';
    globalThis.__GFC_FIREBASE_PROJECT_ID__ = 'project';
    globalThis.__GFC_FIREBASE_APP_ID__ = 'app-id';

    await jest.isolateModulesAsync(async () => {
      const firebase = await import('./firebase');

      expect(initializeFirestore).toHaveBeenCalledWith(
        { name: 'existing' },
        { localCache: { kind: 'memory' } }
      );
      expect(setPersistence).toHaveBeenCalledWith(
        { name: 'auth' },
        browserLocalPersistence
      );
      expect(getFirestore).toHaveBeenCalledWith({ name: 'existing' });
      expect(firebase.db).toEqual({ name: 'existing-db' });
      expect(initializeApp).not.toHaveBeenCalled();
    });
  });
});
