import React from 'react';
import { useDispatch } from 'react-redux';
import type { User } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import type { OverlaysState } from '../store/overlaysSlice';
import { auth } from '../lib/firebase';
import { clearLocalTestAccount, createLocalTestUser, readLocalTestAccount } from '../lib/localTestAccount';
import { queueProductMetric } from '../utils/productMetrics';
import type { UserSettingsDocument } from './userSettingsDocument';
import { readRemoteSettings } from './userSettingsDocument';
import { applySettingsToState } from './hostedSettingsSync';
import { extractLocalUserFromData, postLocalJson, safeParseJson } from './authCommon';

type AuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signed_in' | 'error';
type SettingsSyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'error';

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

/**
 * Initializes local-only auth state by probing the dev server's /api/local/profile endpoint.
 * Extracts a minimal user shape and applies any remote settings into local Redux state.
 * This is intentionally defined outside the hook to keep useLocalAuthState's cyclomatic
 * complexity lower for code health tools.
 */
export const initLocalAuthState = async (opts: {
  isActive: () => boolean;
  dispatch: ReturnType<typeof useDispatch>;
  currentDarkModeRef: React.MutableRefObject<boolean>;
  currentOverlaysRef: React.MutableRefObject<OverlaysState>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
}) => {
  const {
    isActive,
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
  } = opts;

  try {
    const localTestAccount = readLocalTestAccount();
    if (localTestAccount) {
      applyLocalAuthData({
        ...createLocalTestUser(localTestAccount),
        betaAccess: true,
      }, {
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
      });
      return;
    }

    const resp = await fetch('/api/local/profile', { method: 'GET', credentials: 'include' });
    if (!isActive()) return;

    if (!resp.ok) {
      setStatus('signed_out');
      setSettingsSyncStatus('idle');
      setUser(null);
      setSyncedSettings(null);
      setBetaAccess(false);
      setBetaAccessLoading(false);
      setError(null);
      return;
    }

    const data = (await safeParseJson<Record<string, unknown>>(resp)) ?? {};

    // Reuse shared local-auth application logic to keep the hook body concise.
    applyLocalAuthData(data, {
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
    });
  } catch (err) {
    if (!isActive()) return;
    setStatus('error');
    setError(err instanceof Error ? err.message : 'Local auth initialization failed');
    setUser(null);
    setSyncedSettings(null);
    setBetaAccess(false);
    setBetaAccessLoading(false);
  }
};

/** Shared helper to apply a local auth response into application state. */
export function applyLocalAuthData(
  data: Record<string, unknown>,
  {
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
  }: {
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
) {
  const localUser = extractLocalUserFromData(data) as unknown as User;

  setUser(localUser);
  setStatus('signed_in');

  const remoteSettings = readRemoteSettings(data.settings as Partial<UserSettingsDocument> | undefined);
  if (remoteSettings) {
    applySettingsToState(remoteSettings, {
      currentDarkModeRef,
      currentOverlaysRef,
      dispatch,
      setSyncedSettings,
      lastSyncedSettingsRef,
    });
    setSettingsSyncStatus('synced');
  } else {
    setSyncedSettings(null);
    setSettingsSyncStatus('idle');
  }

  setBetaAccess(Boolean(data.betaAccess));
  setBetaAccessLoading(false);
  setError(null);
}

/** Local API route and metric suffix selected by the public credential wrappers. */
type LocalCredentialAction = 'signin' | 'signup';

/** Post a local credential action and apply its response to the shared auth state. */
async function localCredentialAction(
  action: LocalCredentialAction,
  creds: { email: string; password: string },
  deps: LocalAuthDeps
) {
  const failureMessage = action === 'signin' ? 'Sign in failed' : 'Sign up failed';
  deps.setError(null);
  const resp = await fetch(`/api/local/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
    credentials: 'include',
  });

  if (!resp.ok) {
    const body = (await safeParseJson<{ message?: string }>(resp)) ?? { message: failureMessage };
    deps.setError(body.message ?? failureMessage);
    throw new Error(body.message ?? failureMessage);
  }

  const data = (await safeParseJson<Record<string, unknown>>(resp)) ?? {};
  const localUser = extractLocalUserFromData(data) as unknown as User;
  applyLocalAuthData(data, deps);
  queueProductMetric({ event: action === 'signin' ? 'account_signin' : 'account_signup', user: localUser });
}

/** Local-only sign in helper: posts to /api/local/signin and applies returned auth data to state. */
export const localSignInWithEmail = (creds: { email: string; password: string }, deps: LocalAuthDeps) =>
  localCredentialAction('signin', creds, deps);

/** Local-only sign up helper: posts to /api/local/signup and applies returned auth data to state. */
export const localSignUpWithEmail = (creds: { email: string; password: string }, deps: LocalAuthDeps) =>
  localCredentialAction('signup', creds, deps);

/** Local-only sign out helper: invalidates local session and clears local state. */
export const localSignOutUser = async (deps: {
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { setUser, setStatus, setSyncedSettings, setSettingsSyncStatus, setBetaAccess } = deps;
  const fixtureActive = Boolean(readLocalTestAccount());
  if (fixtureActive && auth) {
    try {
      await signOut(auth);
    } catch {
      // Fixture sign-out must still clear the local session if hosted auth is unavailable.
    }
  }
  try {
    await postLocalJson('/api/local/signout', { failureMessage: 'Unable to sign out right now.' });
  } catch {
    // ignore local sign out errors
  }

  setUser(null);
  clearLocalTestAccount();
  setStatus('signed_out');
  setSyncedSettings(null);
  setSettingsSyncStatus('idle');
  setBetaAccess(false);
};

/** Refresh local-only beta access flag by querying /api/local/profile. */
export const localRefreshBetaAccess = async (deps: {
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { setBetaAccess, setBetaAccessLoading } = deps;
  setBetaAccessLoading(true);

  try {
    const resp = await fetch('/api/local/profile', { method: 'GET', credentials: 'include' });
    if (!resp.ok) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }

    const data = (await safeParseJson<Record<string, unknown>>(resp)) ?? {};
    setBetaAccess(Boolean(data.betaAccess));
  } catch {
    setBetaAccess(false);
  } finally {
    setBetaAccessLoading(false);
  }
};

/** Update remote synced settings for local-only auth. */
export const localUpdateSyncedSettings = async (
  settings: Partial<UserSettingsDocument>,
  deps: {
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    currentDarkModeRef: React.MutableRefObject<boolean>;
    currentOverlaysRef: React.MutableRefObject<OverlaysState>;
    dispatch: ReturnType<typeof useDispatch>;
    setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
    lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
    setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  }
) => {
  const { setError, currentDarkModeRef, currentOverlaysRef, dispatch, setSyncedSettings, lastSyncedSettingsRef, setSettingsSyncStatus } = deps;
  setError(null);

  let data: Record<string, unknown>;
  try {
    data = await postLocalJson<Record<string, unknown>>('/api/local/profile', {
      body: { settings },
      failureMessage: 'Unable to update synced settings right now.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update synced settings right now.';
    setError(message);
    throw error instanceof Error ? error : new Error(message);
  }

  const remoteSettings = readRemoteSettings(data.settings as Partial<UserSettingsDocument> | undefined);
  if (remoteSettings) {
    applySettingsToState(remoteSettings, {
      currentDarkModeRef,
      currentOverlaysRef,
      dispatch,
      setSyncedSettings,
      lastSyncedSettingsRef,
    });
    setSettingsSyncStatus('synced');
  }
};
