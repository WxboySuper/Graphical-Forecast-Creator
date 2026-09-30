import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAdditionalUserInfo,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { RootState } from '../store';
import type { OverlaysState } from '../store/overlaysSlice';
import { auth, db, googleAuthProvider, isHostedAuthEnabled, requireAuth, requireDb } from '../lib/firebase';
import { readLocalTestAccount } from '../lib/localTestAccount';
import { queueProductMetric } from '../utils/productMetrics';
import type { MonitorSettings } from '../monitor/types';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';
import {
  DEFAULT_FORECAST_UI_VARIANT,
  readStoredForecastUiVariant,
  type ForecastUiVariant,
  writeStoredForecastUiVariant,
} from '../utils/forecastUiVariant';
import type { UserSettingsDocument } from './userSettingsDocument';
import {
  areUserSettingsEqual,
  mergeUserSettingsDocument,
} from './userSettingsDocument';
import { getSettingsUpdateError } from './authSyncErrors';
import {
  applySettingsToState,
  attachHostedSettingsSubscription,
  cancelPendingHostedSettingsWriteIntent,
  runInitialHostedSync,
  scheduleHostedSettingsDocumentWrite,
  shouldSkipHostedSettingsDocumentWrite,
  type ApplyHostedSettingsOptions,
  type ApplySettingsContext,
  type InFlightHostedSettingsWrite,
  type PendingHostedSettingsWrite,
} from './hostedSettingsSync';

export type { UserSettingsDocument } from './userSettingsDocument';
export {
  areUserSettingsEqual,
  mergeUserSettingsDocument,
  readRemoteSettings,
} from './userSettingsDocument';
export { getSettingsSyncError, getSettingsUpdateError } from './authSyncErrors';
export {
  applySettingsToState,
  areOverlaySettingsEqual,
  attachHostedSettingsSubscription,
  cancelPendingHostedSettingsWriteIntent,
  coalesceRemoteSettingsWithPendingLocal,
  consumeSupersededBaselineOneShotIgnore,
  finalizeHostedSettingsWriteFailure,
  getRemoteSeedPayload,
  handleHostedSettingsFirestoreSnapshot,
  isUserSettingsDocumentFieldEqual,
  runInitialHostedSync,
  scheduleHostedSettingsDocumentWrite,
  seedOrApplySettings,
  shouldIgnoreHostedSettingsSnapshot,
  shouldSkipHostedSettingsDocumentWrite,
  startSettingsSubscription,
  syncProfileDocument,
  updatePendingHostedSettingsWriteTarget,
  type ApplyHostedSettingsOptions,
  type ApplySettingsContext,
  type HostedSettingsSnapshotMetadata,
  type InFlightHostedSettingsWrite,
  type PendingHostedSettingsWrite,
} from './hostedSettingsSync';

import { safeParseJson } from './authCommon';
import {
  initLocalAuthState,
  localRefreshBetaAccess,
  localSignInWithEmail,
  localSignOutUser,
  localSignUpWithEmail,
  localUpdateSyncedSettings,
} from './localAuthClient';

type AuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signed_in' | 'error';
type SettingsSyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'error';

interface UserProfileDocument {
  betaAccess?: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  settingsSyncStatus: SettingsSyncStatus;
  user: User | null;
  syncedSettings: UserSettingsDocument | null;
  error: string | null;
  hostedAuthEnabled: boolean;
  betaAccess: boolean;
  betaAccessLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
  updateSyncedSettings: (settings: Partial<UserSettingsDocument>) => Promise<void>;
  refreshBetaAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const INITIAL_PROFILE_SYNC_STATUS: SettingsSyncStatus = isHostedAuthEnabled ? 'idle' : 'disabled';

/** Rejects hosted-auth actions when the current deployment intentionally runs in local-only mode. */
export const disabledAuthAction = (): Promise<void> => {
  throw new Error('Hosted accounts are not enabled for this deployment.');
};

/** Returns the settings-sync status that corresponds to the current deployment mode. */
export const getDisabledSettingsStatus = (): SettingsSyncStatus => (isHostedAuthEnabled ? 'idle' : 'disabled');

/** True when the hosted settings sync has everything it needs to run for the current user. */
export const canSyncHostedUserDocuments = (user: User | null): user is User =>
  Boolean(isHostedAuthEnabled && db && user);

/** Clears local Firebase state after the server has already completed deletion. */
export const clearDeletedAccountSession = async (
  signOutAction: () => Promise<void>,
  clearLocalState: () => void,
): Promise<void> => {
  // The server's 204 is authoritative. Clear React state first so the deleted
  // account view cannot remain mounted if Firebase's local sign-out rejects.
  clearLocalState();
  try {
    await signOutAction();
  } catch {
    // Server deletion is authoritative; local cleanup failure must not report
    // that the permanently completed deletion itself failed.
  }
};

/** Reauthenticates the current hosted user and requests the server-side deletion cascade. */
export const deleteHostedAccount = async (
  user: User,
  password?: string,
  clearLocalState: () => void = () => undefined,
): Promise<void> => {
  const hasGoogleProvider = user.providerData.some((provider) => provider.providerId === 'google.com');
  const hasPasswordProvider = user.providerData.some((provider) => provider.providerId === 'password');
  if (hasGoogleProvider) {
    await reauthenticateWithPopup(user, googleAuthProvider);
  } else if (hasPasswordProvider && user.email) {
    if (!password) throw new Error('Enter your current password to delete this account.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else {
    throw new Error('This sign-in method cannot be reauthenticated here. Contact support for account deletion.');
  }

  const token = await user.getIdToken(true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmation: 'DELETE' }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await safeParseJson<{ error?: string }>(response);
      throw new Error(body?.error || 'Unable to delete your account right now.');
    }
  } finally {
    clearTimeout(timeout);
  }

  await clearDeletedAccountSession(() => signOut(requireAuth()), clearLocalState);
};

/** Builds the normalized settings document shape from current local state. */
interface BuildSettingsArgs {
  darkMode: boolean;
  overlays: OverlaysState;
  defaultForecasterName: string;
  forecastUiVariant: ForecastUiVariant;
  monitorSettings?: MonitorSettings;
}
/** Builds the normalized settings document shape from current local state. */
export const createSettingsSnapshot = (args: BuildSettingsArgs): UserSettingsDocument => {
  const { darkMode, overlays, defaultForecasterName, forecastUiVariant, monitorSettings } = args;
  return {
    darkMode,
    baseMapStyle: overlays.baseMapStyle,
    stateBorders: overlays.stateBorders,
    counties: overlays.counties,
    ghostOutlooks: overlays.ghostOutlooks,
    defaultForecasterName,
    forecastUiVariant,
    monitorSettings: monitorSettings ?? DEFAULT_MONITOR_SETTINGS,
  };
};

/** Creates the user profile payload written to Firestore on hosted sign-in. */
export const createProfilePayload = (user: User, opts?: { includeCreatedAt?: boolean }) => ({
  email: user.email ?? '',
  displayName: user.displayName ?? '',
  photoURL: user.photoURL ?? '',
  providers: (user.providerData ?? []).map((provider) => provider.providerId),
  updatedAt: serverTimestamp(),
  ...(opts?.includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
});

/** Reads the current beta-access flag from one hosted profile document snapshot. */
export const readProfileBetaAccess = (value: Partial<UserProfileDocument> | undefined): boolean =>
  Boolean(value?.betaAccess);

export {
  asRecord,
  extractLocalUserFromData,
  postLocalJson,
  safeParseJson,
} from './authCommon';
export {
  applyLocalAuthData,
  initLocalAuthState,
  localRefreshBetaAccess,
  localSignInWithEmail,
  localSignOutUser,
  localSignUpWithEmail,
  localUpdateSyncedSettings,
} from './localAuthClient';

/** Writes a merged settings document to Firestore with an updated server timestamp. */
const writeHostedSettingsDocument = async (
  settingsRef: ReturnType<typeof doc>,
  nextSettings: UserSettingsDocument,
): Promise<void> => {
  await setDoc(
    settingsRef,
    {
      ...nextSettings,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

/** Builds a full settings snapshot from local UI state when hosted sync has no baseline yet. */
const buildHostedAccountFallbackSettings = (
  darkMode: boolean,
  overlays: OverlaysState,
  displayName: string,
  forecastUiVariant: ForecastUiVariant,
  monitorSettings: MonitorSettings,
): UserSettingsDocument =>
  createSettingsSnapshot({
    darkMode,
    overlays,
    defaultForecasterName: displayName,
    forecastUiVariant,
    monitorSettings,
  });

interface PersistHostedSettingsContext {
  user: User;
  darkMode: boolean;
  overlays: OverlaysState;
  syncedSettings: UserSettingsDocument | null;
  monitorSettings: MonitorSettings;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

/** Merges a settings patch into the hosted document and updates local sync state. */
const persistHostedSettingsUpdate = async (
  context: PersistHostedSettingsContext,
  patch: Partial<UserSettingsDocument>,
): Promise<void> => {
  const {
    user,
    darkMode,
    overlays,
    syncedSettings,
    monitorSettings,
    lastSyncedSettingsRef,
    setSyncedSettings,
    setSettingsSyncStatus,
    setError,
  } = context;

  const forecastUiVariant =
    syncedSettings?.forecastUiVariant ?? readStoredForecastUiVariant() ?? DEFAULT_FORECAST_UI_VARIANT;
  const fallbackSettings = buildHostedAccountFallbackSettings(
    darkMode,
    overlays,
    user.displayName ?? '',
    forecastUiVariant,
    syncedSettings?.monitorSettings ?? monitorSettings,
  );
  const baselineSettings = lastSyncedSettingsRef.current ?? fallbackSettings;
  const nextSettings = mergeUserSettingsDocument(baselineSettings, patch);
  if (areUserSettingsEqual(baselineSettings, nextSettings)) {
    setSettingsSyncStatus('synced');
    return;
  }

  const previousSettings = lastSyncedSettingsRef.current;
  const previousSyncedSettings = syncedSettings;
  lastSyncedSettingsRef.current = nextSettings;
  setSyncedSettings(nextSettings);
  setSettingsSyncStatus('syncing');
  setError(null);

  try {
    await writeHostedSettingsDocument(doc(requireDb(), 'userSettings', user.uid), nextSettings);
    setSettingsSyncStatus('synced');
    writeStoredForecastUiVariant(nextSettings.forecastUiVariant);
  } catch (updateError) {
    lastSyncedSettingsRef.current = previousSettings;
    setSyncedSettings(previousSyncedSettings);
    setSettingsSyncStatus('error');
    setError(getSettingsUpdateError(updateError));
    throw updateError;
  }
};



/** Returns the no-config auth context used for intentionally local-only deployments. */
export const getDefaultContextValue = (): AuthContextValue => ({
  status: 'disabled',
  settingsSyncStatus: 'disabled',
  user: null,
  syncedSettings: null,
  error: null,
  hostedAuthEnabled: false,
  betaAccess: false,
  betaAccessLoading: false,
  signInWithGoogle: disabledAuthAction,
  signInWithEmail: disabledAuthAction,
  signUpWithEmail: disabledAuthAction,
  signOutUser: disabledAuthAction,
  deleteAccount: disabledAuthAction,
  updateSyncedSettings: disabledAuthAction,
  refreshBetaAccess: disabledAuthAction,
});

/** Owns the hosted-auth state machine, Firestore sync, and account actions used by the provider. */
/** Local-only auth action helpers (extracted to reduce hook complexity) */

/** Provides local-only auth state and actions for dev servers. */
interface LocalAuthDeps {
  dispatch: ReturnType<typeof useDispatch>;
  currentDarkModeRef: React.MutableRefObject<boolean>;
  currentOverlaysRef: React.MutableRefObject<OverlaysState>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

/** BuildLocalActions: creates wrapper action functions for local dev auth flows.
 *
 * These wrappers adapt the local helper functions (localSignInWithEmail, localSignUpWithEmail, etc.)
 * to the shape expected by components and keep wiring centralized behind a typed LocalAuthDeps object.
 */
function buildLocalActions(deps: LocalAuthDeps) {
  return {
    signInWithEmail: (email: string, password: string) =>
      localSignInWithEmail({ email, password }, deps),
    signUpWithEmail: (email: string, password: string) =>
      localSignUpWithEmail({ email, password }, deps),
    signOutUser: () =>
      localSignOutUser({
        setUser: deps.setUser,
        setStatus: deps.setStatus,
        setSyncedSettings: deps.setSyncedSettings,
        setSettingsSyncStatus: deps.setSettingsSyncStatus,
        setBetaAccess: deps.setBetaAccess,
      }),
    refreshBetaAccess: (): Promise<void> =>
      localRefreshBetaAccess({ setBetaAccess: deps.setBetaAccess, setBetaAccessLoading: deps.setBetaAccessLoading }),
    updateSyncedSettings: (settings: Partial<UserSettingsDocument>): Promise<void> =>
      localUpdateSyncedSettings(settings, {
        setError: deps.setError,
        currentDarkModeRef: deps.currentDarkModeRef,
        currentOverlaysRef: deps.currentOverlaysRef,
        dispatch: deps.dispatch,
        setSyncedSettings: deps.setSyncedSettings,
        lastSyncedSettingsRef: deps.lastSyncedSettingsRef,
        setSettingsSyncStatus: deps.setSettingsSyncStatus,
      }),
  };
}

/** useLocalAuthState: Hook that provides local-only auth state and actions (dev-only).
 *
 * Exposes the same AuthContextValue shape as the hosted implementation but operates
 * against the local /api/local/* endpoints. Intended to be used by development servers
 * to enable beta/local-only flows without requiring hosted auth.
 */
const useLocalAuthState = (): AuthContextValue => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const overlays = useSelector((state: RootState) => state.overlays);
  const currentDarkModeRef = useRef(darkMode);
  const currentOverlaysRef = useRef(overlays);
  const lastSyncedSettingsRef = useRef<UserSettingsDocument | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [settingsSyncStatus, setSettingsSyncStatus] = useState<SettingsSyncStatus>('idle');
  const [user, setUser] = useState<User | null>(null);
  const [syncedSettings, setSyncedSettings] = useState<UserSettingsDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [betaAccess, setBetaAccess] = useState(false);
  const [betaAccessLoading, setBetaAccessLoading] = useState(false);

  useEffect(() => {
    currentDarkModeRef.current = darkMode;
  }, [darkMode]);

  useEffect(() => {
    currentOverlaysRef.current = overlays;
  }, [overlays]);

  useEffect(() => {
    let isActive = true;

    // Delegate complex initialization to a helper to keep hook complexity low.
    initLocalAuthState({
      isActive: () => isActive,
      dispatch,
      currentDarkModeRef,
      currentOverlaysRef,
      setUser,
      setStatus,
      setSettingsSyncStatus,
      setSyncedSettings,
      setBetaAccess,
      setBetaAccessLoading,
      setError,
      lastSyncedSettingsRef,
    });

    return () => {
      isActive = false;
    };
  }, [dispatch]);

  const localActions = useMemo(() => buildLocalActions({
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSyncedSettings,
    setSettingsSyncStatus,
    lastSyncedSettingsRef,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
  }), [
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSyncedSettings,
    setSettingsSyncStatus,
    lastSyncedSettingsRef,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
  ]);

  const { signInWithEmail, signUpWithEmail, signOutUser, refreshBetaAccess, updateSyncedSettings } = localActions;

  const value = useMemo<AuthContextValue>(() => ({
    status,
    settingsSyncStatus,
    user,
    syncedSettings,
    error,
    hostedAuthEnabled: true,
    betaAccess,
    betaAccessLoading,
    signInWithGoogle: disabledAuthAction,
    signInWithEmail,
    signUpWithEmail,
    signOutUser,
    deleteAccount: disabledAuthAction,
    updateSyncedSettings,
    refreshBetaAccess,
  }), [
    status,
    settingsSyncStatus,
    user,
    syncedSettings,
    error,
    betaAccess,
    betaAccessLoading,
    signInWithEmail,
    signUpWithEmail,
    signOutUser,
    updateSyncedSettings,
    refreshBetaAccess,
  ]);

  return value;
};

/**
 * Provides hosted-auth state and actions while syncing user documents with Firestore.
 * Handles auth state changes, settings synchronization, and beta access refresh.
 */
const useHostedAuthState = (): AuthContextValue => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const overlays = useSelector((state: RootState) => state.overlays);
  const monitorSettings = useSelector((state: RootState) => state.monitor);
  const currentDarkModeRef = useRef(darkMode);
  const currentOverlaysRef = useRef(overlays);
  const currentMonitorSettingsRef = useRef(monitorSettings);
  const hasInitializedSettingsRef = useRef(false);
  const lastSyncedSettingsRef = useRef<UserSettingsDocument | null>(null);
  const pendingDebounceTimerRef = useRef<number | null>(null);
  const pendingLocalSettingsIntentRef = useRef<PendingHostedSettingsWrite | null>(null);
  const inFlightHostedSettingsWriteRef = useRef<InFlightHostedSettingsWrite | null>(null);
  const settingsWriteSequenceRef = useRef(0);
  const supersededBaselineOneShotRef = useRef<UserSettingsDocument | null>(null);
  const hostedSyncUserUidRef = useRef<string | null>(null);
  const hostedUserSyncActiveRef = useRef(false);
  const betaAccessRequestIdRef = useRef(0);
  const [status, setStatus] = useState<AuthStatus>(isHostedAuthEnabled ? 'loading' : 'disabled');
  const [settingsSyncStatus, setSettingsSyncStatus] = useState<SettingsSyncStatus>(INITIAL_PROFILE_SYNC_STATUS);
  const [user, setUser] = useState<User | null>(null);
  const [syncedSettings, setSyncedSettings] = useState<UserSettingsDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [betaAccess, setBetaAccess] = useState(false);
  const [betaAccessLoading, setBetaAccessLoading] = useState(Boolean(isHostedAuthEnabled));

  useEffect(() => {
    currentDarkModeRef.current = darkMode;
  }, [darkMode]);

  useEffect(() => {
    currentOverlaysRef.current = overlays;
  }, [overlays]);

  useEffect(() => {
    currentMonitorSettingsRef.current = monitorSettings;
  }, [monitorSettings]);

  useEffect(() => {
    hostedSyncUserUidRef.current = user?.uid ?? null;
  }, [user]);

  useEffect(function subscribeToHostedAuthState() {
    if (!isHostedAuthEnabled || !auth) {
      setStatus('disabled');
      setSettingsSyncStatus('disabled');
      setUser(null);
      setSyncedSettings(null);
      setBetaAccess(false);
      setBetaAccessLoading(false);
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
          setBetaAccess(false);
          setBetaAccessLoading(false);
        }
        setError(null);
      },
      (nextError) => {
        setUser(null);
        setStatus('error');
        setSettingsSyncStatus('error');
        setSyncedSettings(null);
        setBetaAccess(false);
        setBetaAccessLoading(false);
        setError(nextError.message);
      }
    );

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupHostedAuthSubscription() {
      unsubscribe();
    };
  }, []);

  useEffect(function syncHostedUserDocuments() {
    if (!canSyncHostedUserDocuments(user)) {
      hasInitializedSettingsRef.current = false;
      lastSyncedSettingsRef.current = null;
      pendingLocalSettingsIntentRef.current = null;
      inFlightHostedSettingsWriteRef.current = null;
      supersededBaselineOneShotRef.current = null;
      cancelPendingHostedSettingsWriteIntent(
        pendingDebounceTimerRef,
        pendingLocalSettingsIntentRef,
      );
      hostedUserSyncActiveRef.current = false;
      setSyncedSettings(null);
      setBetaAccess(false);
      setBetaAccessLoading(false);
      if (status !== 'loading') {
        setSettingsSyncStatus(getDisabledSettingsStatus());
      }
      return;
    }

    let isActive = true;
    hostedUserSyncActiveRef.current = true;
    const settingsRef = doc(requireDb(), 'userSettings', user.uid);
    const profileRef = doc(requireDb(), 'userProfiles', user.uid);
    let unsubscribeSettings: Unsubscribe | undefined;

    /** Captures the current local settings so they can seed a missing cloud document. */
    const buildLocalSettingsSnapshot = (): UserSettingsDocument =>
      createSettingsSnapshot({
        darkMode: currentDarkModeRef.current,
        overlays: currentOverlaysRef.current,
        defaultForecasterName: user.displayName ?? '',
        forecastUiVariant: readStoredForecastUiVariant() ?? DEFAULT_FORECAST_UI_VARIANT,
        monitorSettings: currentMonitorSettingsRef.current,
      });

    const settingsApplyContext: ApplySettingsContext = {
      currentDarkModeRef,
      currentOverlaysRef,
      dispatch,
      setSyncedSettings,
      lastSyncedSettingsRef,
    };

    /** Applies validated remote settings into Redux and local auth state. */
    const applyRemoteSettings = (
      settings: UserSettingsDocument,
      options?: ApplyHostedSettingsOptions,
    ) => applySettingsToState(settings, settingsApplyContext, options);
    const subscriptionPromise = runInitialHostedSync({
      profileRef,
      settingsRef,
      user,
      buildLocalSettingsSnapshot,
      applyRemoteSettings,
      isActive: () => isActive,
      getPendingLocalWrite: () => pendingLocalSettingsIntentRef.current,
      getInFlightHostedSettingsWrite: () => inFlightHostedSettingsWriteRef.current,
      getSupersededBaselineOneShot: () => supersededBaselineOneShotRef.current,
      clearSupersededBaselineOneShot: () => {
        supersededBaselineOneShotRef.current = null;
      },
      lastSyncedSettingsRef,
      setSyncedSettings,
      setSettingsSyncStatus,
      setError,
      hasInitializedSettingsRef,
    });
    attachHostedSettingsSubscription(subscriptionPromise, () => isActive, (nextUnsubscribe) => {
      unsubscribeSettings = nextUnsubscribe;
    });

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupHostedUserSync() {
      isActive = false;
      hostedUserSyncActiveRef.current = false;
      hasInitializedSettingsRef.current = false;
      pendingLocalSettingsIntentRef.current = null;
      inFlightHostedSettingsWriteRef.current = null;
      supersededBaselineOneShotRef.current = null;
      cancelPendingHostedSettingsWriteIntent(
        pendingDebounceTimerRef,
        pendingLocalSettingsIntentRef,
      );
      unsubscribeSettings?.();
    };
  }, [dispatch, status, user]);

  /** Refreshes the signed-in user's beta-access flag from the hosted profile document. */
  const refreshBetaAccess = useCallback(async (): Promise<void> => {
    const hostedProfileUnavailable = !isHostedAuthEnabled || !db || !user;
    if (hostedProfileUnavailable) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }

    betaAccessRequestIdRef.current += 1;
    const requestId = betaAccessRequestIdRef.current;
    setBetaAccessLoading(true);

    try {
      const profileSnapshot = await getDoc(doc(requireDb(), 'userProfiles', user.uid));
      if (requestId !== betaAccessRequestIdRef.current) {
        return;
      }

      setBetaAccess(
        readProfileBetaAccess(profileSnapshot.data() as Partial<UserProfileDocument> | undefined)
      );
    } catch {
      if (requestId !== betaAccessRequestIdRef.current) {
        return;
      }

      setBetaAccess(false);
    } finally {
      if (requestId === betaAccessRequestIdRef.current) {
        setBetaAccessLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!isHostedAuthEnabled || !db) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }

    if (status === 'loading') {
      setBetaAccessLoading(true);
      return;
    }

    if (!user) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }

    refreshBetaAccess().catch(() => {
      // Beta-access failures fall back to the locked beta gate.
    });
  }, [refreshBetaAccess, status, user]);

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

    const nextSettings = createSettingsSnapshot({
      darkMode,
      overlays,
      defaultForecasterName: syncedSettings?.defaultForecasterName ?? user.displayName ?? '',
      forecastUiVariant: syncedSettings?.forecastUiVariant ?? DEFAULT_FORECAST_UI_VARIANT,
      monitorSettings: syncedSettings?.monitorSettings ?? monitorSettings,
    });

    if (
      shouldSkipHostedSettingsDocumentWrite(
        nextSettings,
        lastSyncedSettingsRef.current,
        inFlightHostedSettingsWriteRef.current,
      )
    ) {
      cancelPendingHostedSettingsWriteIntent(
        pendingDebounceTimerRef,
        pendingLocalSettingsIntentRef,
      );
      return;
    }

    const settingsRef = doc(requireDb(), 'userSettings', user.uid);
    const writeOwnerUid = user.uid;

    scheduleHostedSettingsDocumentWrite({
      nextSettings,
      debounceMs: 750,
      settingsRef,
      lastSyncedSettingsRef,
      pendingLocalSettingsIntentRef,
      inFlightHostedSettingsWriteRef,
      settingsWriteSequenceRef,
      pendingDebounceTimerRef,
      supersededBaselineOneShotRef,
      writeOwnerUid,
      isWriteOwnerActive: () =>
        hostedUserSyncActiveRef.current && hostedSyncUserUidRef.current === writeOwnerUid,
      onPersisted: (settings) => {
        setSyncedSettings(settings);
        setSettingsSyncStatus('synced');
      },
      onPersistError: (syncError) => {
        setSettingsSyncStatus('error');
        setError(getSettingsUpdateError(syncError));
      },
    });

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupPendingSettingsWrite() {
      cancelPendingHostedSettingsWriteIntent(
        pendingDebounceTimerRef,
        pendingLocalSettingsIntentRef,
      );
    };
  }, [darkMode, monitorSettings, overlays, settingsSyncStatus, status, syncedSettings?.defaultForecasterName, syncedSettings?.forecastUiVariant, syncedSettings?.monitorSettings, user]);

  /** Persists explicit account settings changes made from the account page. */
  const updateSyncedSettings = useCallback(
    (settings: Partial<UserSettingsDocument>): Promise<void> =>
      persistHostedSettingsUpdate(
        {
          user: user as User,
          darkMode,
          overlays,
          syncedSettings,
          monitorSettings,
          lastSyncedSettingsRef,
          setSyncedSettings,
          setSettingsSyncStatus,
          setError,
        },
        settings,
      ),
    [darkMode, lastSyncedSettingsRef, monitorSettings, overlays, setError, setSettingsSyncStatus, setSyncedSettings, syncedSettings, user],
  );

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
      betaAccess,
      betaAccessLoading,
      signInWithGoogle: async () => {
        setError(null);
        const credential = await signInWithPopup(requireAuth(), googleAuthProvider);
        queueProductMetric({
          event: getAdditionalUserInfo(credential)?.isNewUser ? 'account_signup' : 'account_signin',
          user: credential.user,
        });
      },
      signInWithEmail: async (email: string, password: string) => {
        setError(null);
        const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
        queueProductMetric({ event: 'account_signin', user: credential.user });
      },
      signUpWithEmail: async (email: string, password: string) => {
        setError(null);
        const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
        queueProductMetric({ event: 'account_signup', user: credential.user });
      },
      signOutUser: async () => {
        setError(null);
        await signOut(requireAuth());
      },
      deleteAccount: async (password?: string) => {
        setError(null);
        if (!user) throw new Error('Sign in before deleting your account.');
        await deleteHostedAccount(user, password, () => {
          setUser(null);
          setStatus('signed_out');
          setSyncedSettings(null);
          setSettingsSyncStatus('idle');
          setBetaAccess(false);
          setBetaAccessLoading(false);
          hasInitializedSettingsRef.current = false;
          lastSyncedSettingsRef.current = null;
        });
      },
      updateSyncedSettings,
      refreshBetaAccess,
    };
  }, [betaAccess, betaAccessLoading, error, refreshBetaAccess, settingsSyncStatus, status, syncedSettings, updateSyncedSettings, user]);

  return value;
};

/** Provides hosted-auth state and actions while gracefully falling back to local-only mode. */
const LocalAuthContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useLocalAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Provides hosted auth state and listeners when no local fixture is active. */
const HostedAuthContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hostedValue = useHostedAuthState();
  const localValue = useLocalAuthState();
  const value = isHostedAuthEnabled ? hostedValue : localValue;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Exposes exactly one auth implementation so fixture sessions never run hosted listeners. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  readLocalTestAccount()
    ? <LocalAuthContextProvider>{children}</LocalAuthContextProvider>
    : <HostedAuthContextProvider>{children}</HostedAuthContextProvider>
);

/** Reads the current hosted-auth state and actions for the app. */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
