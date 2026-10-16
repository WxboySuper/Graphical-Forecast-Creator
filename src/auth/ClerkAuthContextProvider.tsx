import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { IdTokenResult, User } from 'firebase/auth';
import { useAuth as useClerkAuth, useClerk, useReverification, useUser } from '@clerk/react';
import type { RootState } from '../store';
import { setDarkMode } from '../store/themeSlice';
import { applyOverlaySettings, initialState as defaultOverlaySettings } from '../store/overlaysSlice';
import { applyMonitorSettings } from '../store/monitorSlice';
import { getBetaApiToken, setBetaApiTokenProvider } from '../lib/betaApi';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';
import {
  DEFAULT_FORECAST_UI_VARIANT,
  readStoredForecastUiVariant,
  writeStoredForecastUiVariant,
} from '../utils/forecastUiVariant';
import {
  applySettingsToState,
  areUserSettingsEqual,
  AuthContext,
  buildHostedAccountFallbackSettings,
  createSettingsSnapshot,
  disabledAuthAction,
  mergeUserSettingsDocument,
  readRemoteSettings,
  type AuthContextValue,
  type AuthStatus,
  type SettingsSyncStatus,
  type UserSettingsDocument,
} from './AuthProvider';
const shouldResetForClerkAccountChange = (isSignedIn: boolean, userId: string | undefined, bootstrapKey: string): boolean => {
  if (!isSignedIn) return false;
  if (!userId) return false;
  if (!bootstrapKey) return false;
  return bootstrapKey !== userId;
};

const isClerkSettingsSyncReady = (
  isSignedIn: boolean,
  user: User | null,
  initialized: boolean,
  bootstrapKey: string,
): user is User => {
  if (!isSignedIn) return false;
  if (!user) return false;
  if (!initialized) return false;
  return bootstrapKey === user.uid;
};

const isCurrentClerkSettingsSync = ({
  active, requestId, latestRequestId, isSignedIn, userId, currentUserId, bootstrapKey,
}: {
  active: boolean;
  requestId: number;
  latestRequestId: number;
  isSignedIn: boolean;
  userId: string;
  currentUserId: string;
  bootstrapKey: string;
}): boolean => {
  if (!active) return false;
  if (requestId !== latestRequestId) return false;
  if (!isSignedIn) return false;
  if (currentUserId !== userId) return false;
  return bootstrapKey === userId;
};

type ClerkUserResource = NonNullable<ReturnType<typeof useUser>['user']>;
type ClerkGetToken = ReturnType<typeof useClerkAuth>['getToken'];

const decodeClerkTokenClaims = (token: string): IdTokenResult['claims'] => {
  try {
    let encoded = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!encoded) return {};
    encoded += '='.repeat((4 - (encoded.length % 4)) % 4);
    const json = decodeURIComponent(Array.from(globalThis.atob(encoded), (character) =>
      `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    return JSON.parse(json) as IdTokenResult['claims'];
  } catch {
    return {};
  }
};

const createClerkUserFacade = (
  clerkUser: ClerkUserResource | null | undefined,
  getToken: ClerkGetToken,
  deleteClerkUser: () => Promise<void>,
): User | null => {
  if (!clerkUser) return null;
  const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
  const photoURL = clerkUser.imageUrl || null;
  const tokenForClerkSession = async (forceRefresh?: boolean) => {
    const token = await getToken({ skipCache: Boolean(forceRefresh) });
    if (!token) throw new Error('Your Clerk session is not ready. Sign in again.');
    return token;
  };
  const time = (value: unknown) => typeof value === 'number' ? new Date(value * 1000).toUTCString() : '';
  return {
    uid: clerkUser.id,
    email,
    displayName,
    photoURL,
    emailVerified: clerkUser.primaryEmailAddress?.verification?.status === 'verified',
    isAnonymous: false,
    metadata: {
      creationTime: clerkUser.createdAt?.toISOString() ?? null,
      lastSignInTime: clerkUser.lastSignInAt?.toISOString() ?? null,
    },
    phoneNumber: clerkUser.primaryPhoneNumber?.phoneNumber ?? null,
    refreshToken: '',
    tenantId: null,
    providerData: [
      ...(clerkUser.passwordEnabled ? [{
        uid: clerkUser.id, displayName, email, phoneNumber: null, photoURL, providerId: 'password',
      }] : []),
      ...(clerkUser.externalAccounts ?? []).map((account) => ({
        uid: account.id,
        displayName: account.username ?? displayName,
        email: account.emailAddress ?? email,
        phoneNumber: null,
        photoURL: account.imageUrl ?? photoURL,
        providerId: account.provider === 'google' ? 'google.com' : `${account.provider}.com`,
      })),
    ],
    getIdToken: tokenForClerkSession,
    getIdTokenResult: async () => {
      const token = await tokenForClerkSession();
      const claims = decodeClerkTokenClaims(token);
      return {
        claims, token, authTime: time(claims.auth_time), issuedAtTime: time(claims.iat), expirationTime: time(claims.exp),
        signInProvider: typeof claims.firebase?.sign_in_provider === 'string' ? claims.firebase.sign_in_provider : null,
      };
    },
    reload: async () => { await clerkUser.reload(); },
    delete: async () => { await deleteClerkUser(); },
    toJSON: () => ({ uid: clerkUser.id, email, displayName, photoURL, emailVerified: clerkUser.primaryEmailAddress?.verification?.status === 'verified' }),
  } as unknown as User;
};

type ClerkRequestContext = {
  clerkUserId: string | undefined;
  isSignedIn: boolean | undefined;
  getToken: ClerkGetToken;
  identityRef: React.MutableRefObject<{ isSignedIn: boolean; userId: string | undefined }>;
};

const requestClerkBetaApi = async (
  context: ClerkRequestContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  const requestUserId = context.clerkUserId;
  if (!context.isSignedIn || !requestUserId) throw new Error('The beta session is signed out.');
  const token = await getBetaApiToken(async () => (await context.getToken()) ?? null, init.signal ?? undefined);
  if (init.signal?.aborted) throw new DOMException('The beta API request was cancelled.', 'AbortError');
  if (!context.identityRef.current.isSignedIn || context.identityRef.current.userId !== requestUserId) {
    throw new Error('The beta session is signed out.');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...init, headers });
};

const putClerkSettings = async (
  queueRef: React.MutableRefObject<Promise<void>>,
  currentUserId: string | undefined,
  request: (path: string, init?: RequestInit) => Promise<Response>,
  settings: UserSettingsDocument,
  userId: string,
  signal?: AbortSignal,
): Promise<Response> => {
  const previous = queueRef.current;
  let release!: () => void;
  queueRef.current = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    if (currentUserId !== userId) throw new Error('The beta session is still initializing. Try changing settings again in a moment.');
    return await request('/api/user/settings', { method: 'PUT', body: JSON.stringify({ settings }), signal });
  } finally {
    release();
  }
};

type ClerkBootstrapContext = {
  isSignedIn: boolean | undefined;
  clerkUserId: string | undefined;
  clerkUser: ClerkUserResource | null | undefined;
  monitorSettings: ReturnType<typeof useSelector>;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  dispatch: ReturnType<typeof useDispatch>;
  currentDarkModeRef: React.MutableRefObject<boolean>;
  currentOverlaysRef: React.MutableRefObject<RootState['overlays']>;
  betaAccessRequestIdRef: React.MutableRefObject<number>;
  betaAccessAbortRef: React.MutableRefObject<AbortController | null>;
  bootstrapKeyRef: React.MutableRefObject<string>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  hasInitializedSettingsRef: React.MutableRefObject<boolean>;
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setBootstrapKey: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

const applyClerkBootstrapSettings = (body: Record<string, any>, context: ClerkBootstrapContext): void => {
  const settings = readRemoteSettings(body?.settings ?? undefined);
  if (settings) {
    applySettingsToState(settings, context);
    context.setSettingsSyncStatus('synced');
    return;
  }
  const displayName = [context.clerkUser?.firstName, context.clerkUser?.lastName].filter(Boolean).join(' ');
  const fallbackSettings = buildHostedAccountFallbackSettings(
    context.currentDarkModeRef.current,
    context.currentOverlaysRef.current,
    displayName,
    readStoredForecastUiVariant() ?? DEFAULT_FORECAST_UI_VARIANT,
    context.monitorSettings as RootState['monitor'],
  );
  context.lastSyncedSettingsRef.current = null;
  context.setSyncedSettings(fallbackSettings);
  context.setSettingsSyncStatus('idle');
};

const applyClerkBootstrapResponse = (body: Record<string, any>, requestId: number, context: ClerkBootstrapContext): void => {
  if (requestId !== context.betaAccessRequestIdRef.current) return;
  context.setBetaAccess(Boolean(body?.user?.betaAccess));
  applyClerkBootstrapSettings(body, context);
  context.hasInitializedSettingsRef.current = true;
  context.setBootstrapKey(context.clerkUserId!);
  context.setError(null);
};

const clearUninitializedClerkBootstrap = (context: ClerkBootstrapContext): void => {
  if (context.bootstrapKeyRef.current === context.clerkUserId) return;
  context.lastSyncedSettingsRef.current = null;
  context.hasInitializedSettingsRef.current = false;
  context.setSyncedSettings(null);
  context.setBootstrapKey('');
};

const applyClerkBootstrapFailure = (error: unknown, requestId: number, context: ClerkBootstrapContext): void => {
  if (requestId !== context.betaAccessRequestIdRef.current) return;
  clearUninitializedClerkBootstrap(context);
  context.setError(error instanceof Error ? error.message : 'Unable to load your beta account.');
  context.setBetaAccess(false);
};

const refreshClerkBetaAccess = async (context: ClerkBootstrapContext): Promise<void> => {
  context.betaAccessAbortRef.current?.abort();
  const abortController = new AbortController();
  context.betaAccessAbortRef.current = abortController;
  const requestId = ++context.betaAccessRequestIdRef.current;
  if (!context.isSignedIn || !context.clerkUserId) {
    context.setBetaAccess(false);
    context.setBetaAccessLoading(false);
    if (context.betaAccessAbortRef.current === abortController) context.betaAccessAbortRef.current = null;
    return;
  }
  context.setBetaAccessLoading(true);
  try {
    const response = await context.request('/api/me/bootstrap', { signal: abortController.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Unable to load your beta account.');
    applyClerkBootstrapResponse(body, requestId, context);
  } catch (error) {
    applyClerkBootstrapFailure(error, requestId, context);
  } finally {
    if (requestId === context.betaAccessRequestIdRef.current) context.setBetaAccessLoading(false);
    if (context.betaAccessAbortRef.current === abortController) context.betaAccessAbortRef.current = null;
  }
};

type ClerkSettingsUpdateContext = {
  currentUser: User | null;
  bootstrapKey: string;
  hasInitializedSettingsRef: React.MutableRefObject<boolean>;
  settingsRequestIdRef: React.MutableRefObject<number>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  darkMode: boolean;
  overlays: RootState['overlays'];
  monitorSettings: RootState['monitor'];
  syncedSettings: UserSettingsDocument | null;
  putSettings: (settings: UserSettingsDocument, userId: string, signal?: AbortSignal) => Promise<Response>;
  clerkIdentityRef: React.MutableRefObject<{ isSignedIn: boolean; userId: string | undefined }>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
};

const requireClerkSettingsUser = (context: ClerkSettingsUpdateContext): User => {
  if (!context.currentUser) throw new Error('Sign in before changing account settings.');
  if (context.bootstrapKey !== context.currentUser.uid || !context.hasInitializedSettingsRef.current) {
    throw new Error('The beta session is still initializing. Try changing settings again in a moment.');
  }
  return context.currentUser;
};

const saveClerkSettingsUpdate = async (
  context: ClerkSettingsUpdateContext,
  userId: string,
  requestId: number,
  next: UserSettingsDocument,
): Promise<void> => {
  const response = await context.putSettings(next, userId);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Unable to update account settings.');
  if (requestId !== context.settingsRequestIdRef.current || context.clerkIdentityRef.current.userId !== userId) return;
  context.lastSyncedSettingsRef.current = next;
  context.setSyncedSettings(next);
  context.setSettingsSyncStatus('synced');
  writeStoredForecastUiVariant(next.forecastUiVariant);
};

const updateClerkSyncedSettings = async (
  context: ClerkSettingsUpdateContext,
  patch: Partial<UserSettingsDocument>,
): Promise<void> => {
  const currentUser = requireClerkSettingsUser(context);
  const requestId = ++context.settingsRequestIdRef.current;
  const userId = currentUser.uid;
  const baseline = (context.bootstrapKey === userId ? context.lastSyncedSettingsRef.current : null)
    ?? buildHostedAccountFallbackSettings(
      context.darkMode, context.overlays, currentUser.displayName ?? '',
      readStoredForecastUiVariant() ?? DEFAULT_FORECAST_UI_VARIANT, context.monitorSettings,
    );
  const next = mergeUserSettingsDocument(baseline, patch);
  context.setSettingsSyncStatus('syncing');
  context.setError(null);
  try {
    await saveClerkSettingsUpdate(context, userId, requestId, next);
  } catch (error) {
    if (requestId !== context.settingsRequestIdRef.current || context.clerkIdentityRef.current.userId !== userId) return;
    context.setSettingsSyncStatus('error');
    context.setError(error instanceof Error ? error.message : 'Unable to update account settings.');
    throw error;
  }
};

type ClerkAccountActionContext = {
  action: () => Promise<unknown>;
  fallbackMessage: string;
  refreshBetaAccess: () => Promise<void>;
  resetAccountState: () => void;
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

const runClerkAccountAction = async (context: ClerkAccountActionContext): Promise<void> => {
  context.setError(null);
  context.setBetaAccess(false);
  context.setBetaAccessLoading(true);
  try {
    await context.action();
    context.resetAccountState();
  } catch (error) {
    const message = error instanceof Error ? error.message : context.fallbackMessage;
    await context.refreshBetaAccess().catch(() => undefined);
    context.setError(message);
    throw error;
  }
};

type ClerkSettingsSyncContext = {
  bootstrapKey: string;
  currentUser: User | null;
  hasInitializedSettingsRef: React.MutableRefObject<boolean>;
  isSignedIn: boolean | undefined;
  darkMode: boolean;
  overlays: RootState['overlays'];
  monitorSettings: RootState['monitor'];
  syncedSettings: UserSettingsDocument | null;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  settingsRequestIdRef: React.MutableRefObject<number>;
  putSettings: (settings: UserSettingsDocument, userId: string, signal?: AbortSignal) => Promise<Response>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

const createClerkSettingsSyncSnapshot = (context: ClerkSettingsSyncContext): UserSettingsDocument | null => {
  if (!isClerkSettingsSyncReady(Boolean(context.isSignedIn), context.currentUser, context.hasInitializedSettingsRef.current, context.bootstrapKey)) return null;
  const baseline = context.syncedSettings ?? buildHostedAccountFallbackSettings(
    context.darkMode, context.overlays, context.currentUser.displayName ?? '',
    readStoredForecastUiVariant() ?? DEFAULT_FORECAST_UI_VARIANT, context.monitorSettings,
  );
  const next = createSettingsSnapshot({
    darkMode: context.darkMode,
    overlays: context.overlays,
    defaultForecasterName: baseline.defaultForecasterName || context.currentUser.displayName || '',
    forecastUiVariant: baseline.forecastUiVariant,
    monitorSettings: baseline.monitorSettings ?? context.monitorSettings,
  });
  return areUserSettingsEqual(context.lastSyncedSettingsRef.current, next) ? null : next;
};

const persistClerkSettingsSync = async (
  context: ClerkSettingsSyncContext,
  args: { active: boolean; requestId: number; userId: string; next: UserSettingsDocument; signal: AbortSignal },
): Promise<void> => {
  try {
    const response = await context.putSettings(args.next, args.userId, args.signal);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Unable to sync account settings.');
    if (!isCurrentClerkSettingsSync({
      active: args.active, requestId: args.requestId, latestRequestId: context.settingsRequestIdRef.current,
      isSignedIn: Boolean(context.isSignedIn), userId: args.userId,
      currentUserId: context.currentUser?.uid ?? '', bootstrapKey: context.bootstrapKey,
    })) return;
    context.lastSyncedSettingsRef.current = args.next;
    context.setSyncedSettings(args.next);
    context.setSettingsSyncStatus('synced');
  } catch (error) {
    if (!isCurrentClerkSettingsSync({
      active: args.active, requestId: args.requestId, latestRequestId: context.settingsRequestIdRef.current,
      isSignedIn: Boolean(context.isSignedIn), userId: args.userId,
      currentUserId: context.currentUser?.uid ?? '', bootstrapKey: context.bootstrapKey,
    })) return;
    context.setSettingsSyncStatus('error');
    context.setError(error instanceof Error ? error.message : 'Unable to sync account settings.');
  }
};

const startClerkSettingsSync = (context: ClerkSettingsSyncContext): (() => void) | undefined => {
  const next = createClerkSettingsSyncSnapshot(context);
  if (!next || !context.currentUser) return;
  let active = true;
  const userId = context.currentUser.uid;
  const abortController = new AbortController();
  const timer = window.setTimeout(() => {
    const requestId = ++context.settingsRequestIdRef.current;
    context.setSettingsSyncStatus('syncing');
    void persistClerkSettingsSync(context, { active, requestId, userId, next, signal: abortController.signal });
  }, 750);
  return () => { active = false; abortController.abort(); window.clearTimeout(timer); };
};

type ClerkAccountSwitchContext = {
  isSignedIn: boolean | undefined;
  clerkUserId: string | undefined;
  bootstrapKey: string;
  dispatch: ReturnType<typeof useDispatch>;
  betaAccessRequestIdRef: React.MutableRefObject<number>;
  betaAccessAbortRef: React.MutableRefObject<AbortController | null>;
  settingsRequestIdRef: React.MutableRefObject<number>;
  settingsWriteQueueRef: React.MutableRefObject<Promise<void>>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  hasInitializedSettingsRef: React.MutableRefObject<boolean>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setBootstrapKey: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

const resetClerkStateForAccountSwitch = (context: ClerkAccountSwitchContext): void => {
  if (!shouldResetForClerkAccountChange(Boolean(context.isSignedIn), context.clerkUserId, context.bootstrapKey)) return;
  context.betaAccessRequestIdRef.current += 1;
  context.betaAccessAbortRef.current?.abort();
  context.settingsRequestIdRef.current += 1;
  context.settingsWriteQueueRef.current = Promise.resolve();
  context.setSettingsSyncStatus('idle');
  context.lastSyncedSettingsRef.current = null;
  context.hasInitializedSettingsRef.current = false;
  context.setSyncedSettings(null);
  context.setBootstrapKey('');
  context.setBetaAccess(false);
  context.setBetaAccessLoading(true);
  context.setError(null);
  context.dispatch(setDarkMode(false));
  context.dispatch(applyOverlaySettings(defaultOverlaySettings));
  context.dispatch(applyMonitorSettings(DEFAULT_MONITOR_SETTINGS));
  writeStoredForecastUiVariant(DEFAULT_FORECAST_UI_VARIANT);
};

type ClerkBootstrapLifecycleContext = Pick<ClerkAccountSwitchContext,
  'clerkUserId' | 'betaAccessRequestIdRef' | 'betaAccessAbortRef' | 'lastSyncedSettingsRef'
  | 'hasInitializedSettingsRef' | 'setSyncedSettings' | 'setSettingsSyncStatus' | 'setBetaAccess'
  | 'setBetaAccessLoading' | 'setBootstrapKey' | 'setError'> & {
    isLoaded: boolean;
    isUserLoaded: boolean;
    isSignedIn: boolean | undefined;
    refreshBetaAccess: () => Promise<void>;
  };

const clearClerkBootstrapWhenSignedOut = (context: ClerkBootstrapLifecycleContext): void => {
  context.betaAccessRequestIdRef.current += 1;
  context.betaAccessAbortRef.current?.abort();
  context.betaAccessAbortRef.current = null;
  context.setSyncedSettings(null);
  context.setSettingsSyncStatus('idle');
  context.setBetaAccess(false);
  context.setBetaAccessLoading(false);
  context.setBootstrapKey('');
  context.setError(null);
  context.lastSyncedSettingsRef.current = null;
  context.hasInitializedSettingsRef.current = false;
};

const runClerkBootstrapLifecycle = (context: ClerkBootstrapLifecycleContext): void | (() => void) => {
  if (!context.isLoaded || !context.isUserLoaded) {
    context.betaAccessRequestIdRef.current += 1;
    context.setBetaAccessLoading(true);
    return;
  }
  if (!context.isSignedIn || !context.clerkUserId) {
    clearClerkBootstrapWhenSignedOut(context);
    return;
  }
  context.refreshBetaAccess().catch(() => undefined);
};

const resolveClerkAuthStatus = (
  isLoaded: boolean,
  isUserLoaded: boolean,
  error: string | null,
  isSignedIn: boolean | undefined,
  hasInitializedSettings: boolean,
  currentUser: User | null,
): AuthStatus => {
  if (!isLoaded || !isUserLoaded) return 'loading';
  if (error && isSignedIn && !hasInitializedSettings) return 'error';
  if (isSignedIn && currentUser) return 'signed_in';
  return 'signed_out';
};

/** Provides Clerk sessions and the beta Worker profile/settings API for the Clerk+D1 beta build. */
export const ClerkAuthContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const overlays = useSelector((state: RootState) => state.overlays);
  const monitorSettings = useSelector((state: RootState) => state.monitor);
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const clerk = useClerk();
  const { user: clerkUser, isLoaded: isUserLoaded } = useUser();
  const clerkUserRef = useRef(clerkUser);
  const clerkIdentityRef = useRef({ isSignedIn: Boolean(isSignedIn), userId: clerkUser?.id });
  useEffect(() => {
    clerkIdentityRef.current = { isSignedIn: Boolean(isSignedIn), userId: clerkUser?.id };
  }, [clerkUser?.id, isSignedIn]);
  useEffect(() => { clerkUserRef.current = clerkUser; }, [clerkUser]);
  const deleteClerkUser = useReverification(async () => {
    const currentUser = clerkUserRef.current;
    if (!currentUser) throw new Error('Sign in before deleting your account.');
    await currentUser.delete();
  });
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  const betaTokenProviderRef = useRef(async () => (await getTokenRef.current()) ?? null);
  useEffect(() => {
    if (!isLoaded) return;
    setBetaApiTokenProvider(isSignedIn ? betaTokenProviderRef.current : null);
  }, [clerkUser?.id, isLoaded, isSignedIn]);
  const [syncedSettings, setSyncedSettings] = useState<UserSettingsDocument | null>(null);
  const [settingsSyncStatus, setSettingsSyncStatus] = useState<SettingsSyncStatus>('idle');
  const [betaAccess, setBetaAccess] = useState(false);
  const [betaAccessLoading, setBetaAccessLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapKey, setBootstrapKey] = useState('');
  const bootstrapKeyRef = useRef(bootstrapKey);
  const lastSyncedSettingsRef = useRef<UserSettingsDocument | null>(null);
  const betaAccessRequestIdRef = useRef(0);
  const settingsRequestIdRef = useRef(0);
  const settingsWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const currentDarkModeRef = useRef(darkMode);
  const currentOverlaysRef = useRef(overlays);
  const hasInitializedSettingsRef = useRef(false);
  const betaAccessAbortRef = useRef<AbortController | null>(null);

  useEffect(() => { currentDarkModeRef.current = darkMode; }, [darkMode]);
  useEffect(() => { currentOverlaysRef.current = overlays; }, [overlays]);
  useEffect(() => { bootstrapKeyRef.current = bootstrapKey; }, [bootstrapKey]);
  const accountSwitchContext: ClerkAccountSwitchContext = {
    isSignedIn, clerkUserId: clerkUser?.id, bootstrapKey, dispatch,
    betaAccessRequestIdRef, betaAccessAbortRef, settingsRequestIdRef, settingsWriteQueueRef,
    lastSyncedSettingsRef, hasInitializedSettingsRef, setSettingsSyncStatus, setSyncedSettings,
    setBetaAccess, setBetaAccessLoading, setBootstrapKey, setError,
  };
  useEffect(() => resetClerkStateForAccountSwitch(accountSwitchContext), [bootstrapKey, clerkUser?.id, dispatch, isSignedIn]);

  const clerkUserId = clerkUser?.id;
  const requestContext = { clerkUserId, isSignedIn, getToken, identityRef: clerkIdentityRef };
  const request = useCallback((path: string, init: RequestInit = {}) =>
    requestClerkBetaApi(requestContext, path, init), [clerkUserId, getToken, isSignedIn]);
  const putSettings = useCallback((settings: UserSettingsDocument, userId: string, signal?: AbortSignal) =>
    putClerkSettings(settingsWriteQueueRef, clerkUserId, request, settings, userId, signal), [clerkUserId, request]);
  const bootstrapContext: ClerkBootstrapContext = {
    isSignedIn, clerkUserId, clerkUser, monitorSettings, request, dispatch,
    currentDarkModeRef, currentOverlaysRef, betaAccessRequestIdRef, betaAccessAbortRef,
    bootstrapKeyRef, lastSyncedSettingsRef, hasInitializedSettingsRef,
    setBetaAccess, setBetaAccessLoading, setSyncedSettings, setSettingsSyncStatus, setBootstrapKey, setError,
  };
  const refreshBetaAccess = useCallback(() => refreshClerkBetaAccess(bootstrapContext), [
    clerkUserId, clerkUser?.firstName, clerkUser?.lastName, dispatch, isSignedIn, monitorSettings, request,
  ]);

  const bootstrapLifecycleContext: ClerkBootstrapLifecycleContext = {
    clerkUserId, betaAccessRequestIdRef, betaAccessAbortRef, lastSyncedSettingsRef, hasInitializedSettingsRef,
    setSyncedSettings, setSettingsSyncStatus, setBetaAccess, setBetaAccessLoading, setBootstrapKey, setError,
    isLoaded, isUserLoaded, isSignedIn, refreshBetaAccess,
  };
  useEffect(() => runClerkBootstrapLifecycle(bootstrapLifecycleContext), [clerkUserId, isLoaded, isSignedIn, isUserLoaded, refreshBetaAccess]);

  const currentUser = useMemo(
    () => createClerkUserFacade(clerkUser, getToken, deleteClerkUser),
    [clerkUser, deleteClerkUser, getToken],
  );

  const settingsUpdateContext: ClerkSettingsUpdateContext = {
    currentUser, bootstrapKey, hasInitializedSettingsRef, settingsRequestIdRef, lastSyncedSettingsRef,
    darkMode, overlays, monitorSettings, syncedSettings, putSettings, clerkIdentityRef,
    setSettingsSyncStatus, setError, setSyncedSettings,
  };
  const updateSyncedSettings = useCallback((patch: Partial<UserSettingsDocument>) =>
    updateClerkSyncedSettings(settingsUpdateContext, patch), [
    bootstrapKey, currentUser, darkMode, monitorSettings, overlays, putSettings, syncedSettings,
  ]);

  const settingsSyncContext: ClerkSettingsSyncContext = {
    bootstrapKey, currentUser, hasInitializedSettingsRef, isSignedIn, darkMode, overlays, monitorSettings, syncedSettings,
    lastSyncedSettingsRef, settingsRequestIdRef, putSettings, setSyncedSettings, setSettingsSyncStatus, setError,
  };
  useEffect(() => startClerkSettingsSync(settingsSyncContext), [
    bootstrapKey, currentUser, darkMode, isSignedIn, monitorSettings, overlays, putSettings, syncedSettings,
  ]);

  const resetClerkAccountState = useCallback(() => {
    setBetaApiTokenProvider(null);
    betaAccessRequestIdRef.current += 1;
    settingsRequestIdRef.current += 1;
    settingsWriteQueueRef.current = Promise.resolve();
    setBetaAccess(false);
    setBetaAccessLoading(false);
    setBootstrapKey('');
    setSyncedSettings(null);
    setSettingsSyncStatus('idle');
    lastSyncedSettingsRef.current = null;
    hasInitializedSettingsRef.current = false;
  }, []);

  const signOutUser = useCallback(() => runClerkAccountAction({
    action: () => clerk.signOut(), fallbackMessage: 'Unable to sign out right now.',
    refreshBetaAccess, resetAccountState: resetClerkAccountState,
    setBetaAccess, setBetaAccessLoading, setError,
  }), [clerk, refreshBetaAccess, resetClerkAccountState]);
  const deleteAccount = useCallback(() => runClerkAccountAction({
    action: deleteClerkUser, fallbackMessage: 'Unable to delete your account right now.',
    refreshBetaAccess, resetAccountState: resetClerkAccountState,
    setBetaAccess, setBetaAccessLoading, setError,
  }), [deleteClerkUser, refreshBetaAccess, resetClerkAccountState]);

  const hasInitializedSettings = Boolean(currentUser && bootstrapKey === currentUser.uid && hasInitializedSettingsRef.current);
  const authStatus = resolveClerkAuthStatus(isLoaded, isUserLoaded, error, isSignedIn, hasInitializedSettings, currentUser);

  const value = useMemo<AuthContextValue>(() => ({
    status: authStatus,
    settingsSyncStatus,
    user: currentUser,
    authProvider: 'clerk',
    syncedSettings: bootstrapKey === currentUser?.uid ? syncedSettings : null,
    error,
    hostedAuthEnabled: typeof __GFC_CLERK_PUBLISHABLE_KEY__ !== 'undefined' && Boolean(__GFC_CLERK_PUBLISHABLE_KEY__),
    betaAccess,
    betaAccessLoading,
    signInWithGoogle: disabledAuthAction,
    signInWithEmail: disabledAuthAction,
    signUpWithEmail: disabledAuthAction,
    signOutUser,
    deleteAccount,
    updateSyncedSettings,
    refreshBetaAccess,
  }), [authStatus, betaAccess, betaAccessLoading, bootstrapKey, currentUser, deleteAccount, error, refreshBetaAccess, settingsSyncStatus, signOutUser, syncedSettings, updateSyncedSettings]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


