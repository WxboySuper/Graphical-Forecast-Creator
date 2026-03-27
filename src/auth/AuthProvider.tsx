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

const disabledAuthAction = async (): Promise<void> => {
  throw new Error('Hosted accounts are not enabled for this deployment.');
};

/** Provides hosted-auth state and actions while gracefully falling back to local-only mode. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const overlays = useSelector((state: RootState) => state.overlays);
  const currentDarkModeRef = useRef(darkMode);
  const currentOverlaysRef = useRef(overlays);
  const hasInitializedSettingsRef = useRef(false);
  const lastSyncedSettingsRef = useRef<UserSettingsDocument | null>(null);
  const [status, setStatus] = useState<AuthStatus>(isHostedAuthEnabled ? 'loading' : 'disabled');
  const [settingsSyncStatus, setSettingsSyncStatus] = useState<SettingsSyncStatus>(isHostedAuthEnabled ? 'idle' : 'disabled');
  const [user, setUser] = useState<User | null>(null);
  const [syncedSettings, setSyncedSettings] = useState<UserSettingsDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentDarkModeRef.current = darkMode;
  }, [darkMode]);

  useEffect(() => {
    currentOverlaysRef.current = overlays;
  }, [overlays]);

  useEffect(() => {
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
        setSettingsSyncStatus(nextUser ? 'idle' : 'disabled');
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

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isHostedAuthEnabled || !db || !user) {
      hasInitializedSettingsRef.current = false;
      lastSyncedSettingsRef.current = null;
      setSyncedSettings(null);
      if (status !== 'loading') {
        setSettingsSyncStatus(isHostedAuthEnabled ? 'idle' : 'disabled');
      }
      return;
    }

    let isActive = true;
    const settingsRef = doc(db, 'userSettings', user.uid);
    const profileRef = doc(db, 'userProfiles', user.uid);
    let unsubscribeSettings: Unsubscribe | undefined;

    const buildLocalSettingsSnapshot = (): UserSettingsDocument => ({
      darkMode: currentDarkModeRef.current,
      baseMapStyle: currentOverlaysRef.current.baseMapStyle,
      stateBorders: currentOverlaysRef.current.stateBorders,
      counties: currentOverlaysRef.current.counties,
      ghostOutlooks: currentOverlaysRef.current.ghostOutlooks,
      defaultForecasterName: user.displayName ?? '',
    });

    const applyRemoteSettings = (settings: UserSettingsDocument) => {
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

    const syncUserDocuments = async () => {
      setSettingsSyncStatus('syncing');

      try {
        await setDoc(
          profileRef,
          {
            email: user.email ?? '',
            displayName: user.displayName ?? '',
            photoURL: user.photoURL ?? '',
            providers: (user.providerData ?? []).map((provider) => provider.providerId),
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );

        const settingsSnapshot = await getDoc(settingsRef);
        const remoteSettings = settingsSnapshot.data() as Partial<UserSettingsDocument> | undefined;
        const localSettings = buildLocalSettingsSnapshot();

        if (
          typeof remoteSettings?.darkMode === 'boolean' &&
          typeof remoteSettings?.stateBorders === 'boolean' &&
          typeof remoteSettings?.counties === 'boolean' &&
          typeof remoteSettings?.defaultForecasterName === 'string' &&
          remoteSettings.baseMapStyle &&
          remoteSettings.ghostOutlooks
        ) {
          applyRemoteSettings({
            darkMode: remoteSettings.darkMode,
            baseMapStyle: remoteSettings.baseMapStyle,
            stateBorders: remoteSettings.stateBorders,
            counties: remoteSettings.counties,
            ghostOutlooks: remoteSettings.ghostOutlooks,
            defaultForecasterName: remoteSettings.defaultForecasterName,
          });
        } else {
          await setDoc(
            settingsRef,
            {
              ...localSettings,
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
          lastSyncedSettingsRef.current = localSettings;
          setSyncedSettings(localSettings);
        }

        hasInitializedSettingsRef.current = true;
        if (isActive) {
          setSettingsSyncStatus('synced');
        }

        unsubscribeSettings = onSnapshot(
          settingsRef,
          (snapshot) => {
            const nextSettings = snapshot.data() as Partial<UserSettingsDocument> | undefined;
            if (
              !nextSettings ||
              typeof nextSettings.darkMode !== 'boolean' ||
              typeof nextSettings.stateBorders !== 'boolean' ||
              typeof nextSettings.counties !== 'boolean' ||
              typeof nextSettings.defaultForecasterName !== 'string' ||
              !nextSettings.baseMapStyle ||
              !nextSettings.ghostOutlooks
            ) {
              return;
            }

            applyRemoteSettings({
              darkMode: nextSettings.darkMode,
              baseMapStyle: nextSettings.baseMapStyle,
              stateBorders: nextSettings.stateBorders,
              counties: nextSettings.counties,
              ghostOutlooks: nextSettings.ghostOutlooks,
              defaultForecasterName: nextSettings.defaultForecasterName,
            });

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
          setError(syncError instanceof Error ? syncError.message : 'Unable to sync account settings right now.');
        }
      }
    };

    void syncUserDocuments();

    return () => {
      isActive = false;
      hasInitializedSettingsRef.current = false;
      unsubscribeSettings?.();
    };
  }, [dispatch, status, user]);

  useEffect(() => {
    if (!isHostedAuthEnabled || !db || !user || settingsSyncStatus === 'disabled' || settingsSyncStatus === 'idle') {
      return;
    }

    if (settingsSyncStatus === 'syncing' || status !== 'signed_in' || !hasInitializedSettingsRef.current) {
      return;
    }

    const nextSettings: UserSettingsDocument = {
      darkMode,
      baseMapStyle: overlays.baseMapStyle,
      stateBorders: overlays.stateBorders,
      counties: overlays.counties,
      ghostOutlooks: overlays.ghostOutlooks,
      defaultForecasterName: syncedSettings?.defaultForecasterName ?? user.displayName ?? '',
    };

    if (JSON.stringify(lastSyncedSettingsRef.current) === JSON.stringify(nextSettings)) {
      return;
    }

    const settingsRef = doc(db, 'userSettings', user.uid);
    lastSyncedSettingsRef.current = nextSettings;

    void setDoc(
      settingsRef,
      {
        ...nextSettings,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((syncError) => {
      lastSyncedSettingsRef.current = null;
      setSettingsSyncStatus('error');
      setError(syncError instanceof Error ? syncError.message : 'Unable to update synced settings right now.');
    });
  }, [darkMode, overlays, settingsSyncStatus, status, syncedSettings?.defaultForecasterName, user]);

  const updateSyncedSettings = async (settings: Partial<UserSettingsDocument>): Promise<void> => {
    if (!isHostedAuthEnabled || !db || !user) {
      throw new Error('Hosted accounts are not enabled for this deployment.');
    }

    const settingsRef = doc(db, 'userSettings', user.uid);
    const nextSettings: UserSettingsDocument = {
      ...(lastSyncedSettingsRef.current ?? {
        darkMode,
        baseMapStyle: overlays.baseMapStyle,
        stateBorders: overlays.stateBorders,
        counties: overlays.counties,
        ghostOutlooks: overlays.ghostOutlooks,
        defaultForecasterName: user.displayName ?? '',
      }),
      ...settings,
    };

    lastSyncedSettingsRef.current = nextSettings;
    setSyncedSettings(nextSettings);
    setSettingsSyncStatus('syncing');
    setError(null);

    await setDoc(
      settingsRef,
      {
        ...nextSettings,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setSettingsSyncStatus('synced');
  };

  const value = useMemo<AuthContextValue>(() => {
    if (!isHostedAuthEnabled || !auth) {
      return {
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
      };
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
