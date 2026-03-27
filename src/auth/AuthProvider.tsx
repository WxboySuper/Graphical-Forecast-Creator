import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { RootState } from '../store';
import { setDarkMode } from '../store/themeSlice';
import { applyOverlaySettings } from '../store/overlaysSlice';
import type { OverlaysState } from '../store/overlaysSlice';
import { auth, db, googleAuthProvider, isHostedAuthEnabled } from '../lib/firebase';

type AuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signed_in' | 'error';
type SettingsSyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'error';

interface UserSettingsDocument {
  darkMode: boolean;
  baseMapStyle: OverlaysState['baseMapStyle'];
  stateBorders: boolean;
  counties: boolean;
  ghostOutlooks: OverlaysState['ghostOutlooks'];
  defaultForecasterName: string;
}

interface AuthContextValue {
  status: AuthStatus;
  settingsSyncStatus: SettingsSyncStatus;
  user: User | null;
  syncedSettings: UserSettingsDocument | null;
  error: string | null;
  hostedAuthEnabled: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  updateSyncedSettings: (settings: Partial<UserSettingsDocument>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const INITIAL_PROFILE_SYNC_STATUS: SettingsSyncStatus = isHostedAuthEnabled ? 'idle' : 'disabled';

/** Rejects hosted-auth actions when the current deployment intentionally runs in local-only mode. */
const disabledAuthAction = (): Promise<void> => {
  throw new Error('Hosted accounts are not enabled for this deployment.');
};

/** Returns the settings-sync status that corresponds to the current deployment mode. */
const getDisabledSettingsStatus = (): SettingsSyncStatus => (isHostedAuthEnabled ? 'idle' : 'disabled');

/** Builds the normalized settings document shape from current local state. */
const createSettingsSnapshot = (
  darkMode: boolean,
  overlays: OverlaysState,
  defaultForecasterName: string
): UserSettingsDocument => ({
  darkMode,
  baseMapStyle: overlays.baseMapStyle,
  stateBorders: overlays.stateBorders,
  counties: overlays.counties,
  ghostOutlooks: overlays.ghostOutlooks,
  defaultForecasterName,
});

/** Validates a Firestore settings payload before the app applies it locally. */
const readRemoteSettings = (value: Partial<UserSettingsDocument> | undefined): UserSettingsDocument | null => {
  if (!value) {
    return null;
  }

  const {
    darkMode,
    baseMapStyle,
    stateBorders,
    counties,
    ghostOutlooks,
    defaultForecasterName,
  } = value;

  if (typeof darkMode !== 'boolean') {
    return null;
  }

  if (typeof stateBorders !== 'boolean' || typeof counties !== 'boolean') {
    return null;
  }

  if (typeof defaultForecasterName !== 'string') {
    return null;
  }

  if (!baseMapStyle || !ghostOutlooks) {
    return null;
  }

  return {
    darkMode,
    baseMapStyle,
    stateBorders,
    counties,
    ghostOutlooks,
    defaultForecasterName,
  };
};

/** Creates the user profile payload written to Firestore on hosted sign-in. */
const createProfilePayload = (user: User) => ({
  email: user.email ?? '',
  displayName: user.displayName ?? '',
  photoURL: user.photoURL ?? '',
  providers: (user.providerData ?? []).map((provider) => provider.providerId),
  updatedAt: serverTimestamp(),
  createdAt: serverTimestamp(),
});

/** Normalizes update-write failures into a user-facing sync error message. */
const getSettingsUpdateError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to update synced settings right now.';

/** Normalizes initial/settings hydration failures into a user-facing sync error message. */
const getSettingsSyncError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to sync account settings right now.';

/** Builds the payload used when seeding or repairing a remote settings document. */
const getRemoteSeedPayload = (settings: UserSettingsDocument, includeCreatedAt: boolean) => ({
  ...settings,
  updatedAt: serverTimestamp(),
  ...(includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
});

interface ApplySettingsContext {
  currentDarkModeRef: React.MutableRefObject<boolean>,
  dispatch: ReturnType<typeof useDispatch>,
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>,
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>
}

/** Applies a validated settings document into Redux plus local hosted-auth state. */
const applySettingsToState = (
  settings: UserSettingsDocument,
  { currentDarkModeRef, dispatch, setSyncedSettings, lastSyncedSettingsRef }: ApplySettingsContext
) => {
  lastSyncedSettingsRef.current = settings;
  setSyncedSettings(settings);

  if (settings.darkMode !== currentDarkModeRef.current) {
    dispatch(setDarkMode(settings.darkMode));
  }

  dispatch(
    applyOverlaySettings({
      baseMapStyle: settings.baseMapStyle,
      stateBorders: settings.stateBorders,
      counties: settings.counties,
      ghostOutlooks: settings.ghostOutlooks,
    })
  );
};

const syncProfileDocument = async (
  profileRef: ReturnType<typeof doc>,
  user: User
): Promise<void> => {
  const profileSnapshot = await getDoc(profileRef);
  await setDoc(
    profileRef,
    {
      ...createProfilePayload(user),
      ...(profileSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );
};

const seedOrApplySettings = async (opts: {
  settingsRef: ReturnType<typeof doc>;
  settingsSnapshot: Awaited<ReturnType<typeof getDoc>>;
  localSettings: UserSettingsDocument;
  applyRemoteSettings: (settings: UserSettingsDocument) => void;
  isActive: () => boolean;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
}): Promise<void> => {
  const {
    settingsRef,
    settingsSnapshot,
    localSettings,
    applyRemoteSettings,
    isActive,
    lastSyncedSettingsRef,
    setSyncedSettings,
  } = opts;
  const remoteSettings = readRemoteSettings(settingsSnapshot.data() as Partial<UserSettingsDocument> | undefined);

  if (!isActive()) {
    return;
  }

  if (remoteSettings) {
    applyRemoteSettings(remoteSettings);
    return;
  }

  await setDoc(
    settingsRef,
    getRemoteSeedPayload(localSettings, !settingsSnapshot.exists()),
    { merge: true }
  );

  if (!isActive()) {
    return;
  }

  lastSyncedSettingsRef.current = localSettings;
  setSyncedSettings(localSettings);
};

/** Returns the no-config auth context used for intentionally local-only deployments. */
const getDefaultContextValue = (): AuthContextValue => ({
  status: 'disabled',
  settingsSyncStatus: 'disabled',
  user: null,
  syncedSettings: null,
  error: null,
  hostedAuthEnabled: false,
  signInWithGoogle: disabledAuthAction,
  signInWithEmail: disabledAuthAction,
  signUpWithEmail: disabledAuthAction,
  signOutUser: disabledAuthAction,
  updateSyncedSettings: disabledAuthAction,
});

const useHostedAuthState = (): AuthContextValue => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const overlays = useSelector((state: RootState) => state.overlays);
  const currentDarkModeRef = useRef(darkMode);
  const currentOverlaysRef = useRef(overlays);
  const hasInitializedSettingsRef = useRef(false);
  const lastSyncedSettingsRef = useRef<UserSettingsDocument | null>(null);
  const [status, setStatus] = useState<AuthStatus>(isHostedAuthEnabled ? 'loading' : 'disabled');
  const [settingsSyncStatus, setSettingsSyncStatus] = useState<SettingsSyncStatus>(INITIAL_PROFILE_SYNC_STATUS);
  const [user, setUser] = useState<User | null>(null);
  const [syncedSettings, setSyncedSettings] = useState<UserSettingsDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentDarkModeRef.current = darkMode;
  }, [darkMode]);

  useEffect(() => {
    currentOverlaysRef.current = overlays;
  }, [overlays]);

  useEffect(function subscribeToHostedAuthState() {
    if (!isHostedAuthEnabled || !auth) {
      setStatus('disabled');
      setSettingsSyncStatus('disabled');
      setUser(null);
      setSyncedSettings(null);
      hasInitializedSettingsRef.current = false;
      lastSyncedSettingsRef.current = null;
      setError(null);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setStatus(nextUser ? 'signed_in' : 'signed_out');
        setSettingsSyncStatus('idle');
        if (!nextUser) {
          setSyncedSettings(null);
        }
        setError(null);
      },
      (nextError) => {
        setUser(null);
        setStatus('error');
        setSettingsSyncStatus('error');
        setSyncedSettings(null);
        setError(nextError.message);
      }
    );

    return function cleanupHostedAuthSubscription() {
      unsubscribe();
    };
  }, []);

  useEffect(function syncHostedUserDocuments() {
    if (!isHostedAuthEnabled || !db || !user) {
      hasInitializedSettingsRef.current = false;
      lastSyncedSettingsRef.current = null;
      setSyncedSettings(null);
      if (status !== 'loading') {
        setSettingsSyncStatus(getDisabledSettingsStatus());
      }
      return;
    }

    let isActive = true;
    const settingsRef = doc(db, 'userSettings', user.uid);
    const profileRef = doc(db, 'userProfiles', user.uid);
    let unsubscribeSettings: Unsubscribe | undefined;
    const settingsApplyContext: ApplySettingsContext = {
      currentDarkModeRef,
      dispatch,
      setSyncedSettings,
      lastSyncedSettingsRef,
    };

    /** Captures the current local settings so they can seed a missing cloud document. */
    const buildLocalSettingsSnapshot = (): UserSettingsDocument =>
      createSettingsSnapshot(currentDarkModeRef.current, currentOverlaysRef.current, user.displayName ?? '');

    /** Applies validated remote settings into Redux and local auth state. */
    const applyRemoteSettings = (settings: UserSettingsDocument) =>
      applySettingsToState(settings, settingsApplyContext);

    /** Creates the hosted profile/settings docs and starts the live settings subscription. */
    const syncUserDocuments = async () => {
      setSettingsSyncStatus('syncing');

      try {
        await syncProfileDocument(profileRef, user);

        const settingsSnapshot = await getDoc(settingsRef);
        const localSettings = buildLocalSettingsSnapshot();
        await seedOrApplySettings({
          settingsRef,
          settingsSnapshot,
          localSettings,
          applyRemoteSettings,
          isActive: () => isActive,
          lastSyncedSettingsRef,
          setSyncedSettings,
        });

        hasInitializedSettingsRef.current = true;
        if (isActive) {
          setSettingsSyncStatus('synced');
        }

        unsubscribeSettings = onSnapshot(
          settingsRef,
          (snapshot) => {
            const nextSettings = readRemoteSettings(snapshot.data() as Partial<UserSettingsDocument> | undefined);
            if (!isActive || !nextSettings) {
              return;
            }

            applyRemoteSettings(nextSettings);

            if (isActive) {
              setSettingsSyncStatus('synced');
            }
          },
          (snapshotError) => {
            if (isActive) {
              setSettingsSyncStatus('error');
              setError(snapshotError.message);
            }
          }
        );
      } catch (syncError) {
        if (isActive) {
          setSettingsSyncStatus('error');
          setError(getSettingsSyncError(syncError));
        }
      }
    };

    syncUserDocuments().catch((syncError) => {
      if (isActive) {
        setSettingsSyncStatus('error');
        setError(getSettingsSyncError(syncError));
      }
    });

    return function cleanupHostedUserSync() {
      isActive = false;
      hasInitializedSettingsRef.current = false;
      unsubscribeSettings?.();
    };
  }, [dispatch, status, user]);

  useEffect(() => {
    const isSyncUnavailable =
      !isHostedAuthEnabled || !db || !user || settingsSyncStatus === 'disabled' || settingsSyncStatus === 'idle';
    if (isSyncUnavailable) {
      return;
    }

    const isSyncBlocked = settingsSyncStatus === 'syncing' || status !== 'signed_in' || !hasInitializedSettingsRef.current;
    if (isSyncBlocked) {
      return;
    }

    const nextSettings = createSettingsSnapshot(
      darkMode,
      overlays,
      syncedSettings?.defaultForecasterName ?? user.displayName ?? ''
    );

    if (JSON.stringify(lastSyncedSettingsRef.current) === JSON.stringify(nextSettings)) {
      return;
    }

    const settingsRef = doc(db, 'userSettings', user.uid);
    lastSyncedSettingsRef.current = nextSettings;

    setDoc(
      settingsRef,
      {
        ...nextSettings,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((syncError) => {
      lastSyncedSettingsRef.current = null;
      setSettingsSyncStatus('error');
      setError(getSettingsUpdateError(syncError));
    });
  }, [darkMode, overlays, settingsSyncStatus, status, syncedSettings?.defaultForecasterName, user]);

  /** Persists explicit account settings changes made from the account page. */
  const updateSyncedSettings = async (settings: Partial<UserSettingsDocument>): Promise<void> => {
    const hostedSyncUnavailable = !isHostedAuthEnabled || !db || !user;
    if (hostedSyncUnavailable) {
      throw new Error('Hosted accounts are not enabled for this deployment.');
    }

    const settingsRef = doc(db, 'userSettings', user.uid);
    const fallbackSettings = createSettingsSnapshot(darkMode, overlays, user.displayName ?? '');
    const nextSettings: UserSettingsDocument = {
      ...(lastSyncedSettingsRef.current ?? fallbackSettings),
      ...settings,
    };
    const previousSettings = lastSyncedSettingsRef.current;
    const previousSyncedSettings = syncedSettings;

    lastSyncedSettingsRef.current = nextSettings;
    setSyncedSettings(nextSettings);
    setSettingsSyncStatus('syncing');
    setError(null);

    try {
      await setDoc(
        settingsRef,
        {
          ...nextSettings,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSettingsSyncStatus('synced');
    } catch (updateError) {
      lastSyncedSettingsRef.current = previousSettings;
      setSyncedSettings(previousSyncedSettings);
      setSettingsSyncStatus('error');
      setError(getSettingsUpdateError(updateError));
      throw updateError;
    }
  };

  const value = useMemo<AuthContextValue>(() => {
    if (!isHostedAuthEnabled || !auth) {
      return getDefaultContextValue();
    }

    return {
      status,
      settingsSyncStatus,
      user,
      syncedSettings,
      error,
      hostedAuthEnabled: true,
      signInWithGoogle: async () => {
        setError(null);
        await signInWithPopup(auth, googleAuthProvider);
      },
      signInWithEmail: async (email: string, password: string) => {
        setError(null);
        await signInWithEmailAndPassword(auth, email, password);
      },
      signUpWithEmail: async (email: string, password: string) => {
        setError(null);
        await createUserWithEmailAndPassword(auth, email, password);
      },
      signOutUser: async () => {
        setError(null);
        await signOut(auth);
      },
      updateSyncedSettings,
    };
  }, [error, settingsSyncStatus, status, syncedSettings, user]);

  return value;
};

/** Provides hosted-auth state and actions while gracefully falling back to local-only mode. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useHostedAuthState();

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Reads the current hosted-auth state and actions for the app. */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
