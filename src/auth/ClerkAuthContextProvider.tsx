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

const getClerkSessionToken = async (getToken: ClerkGetToken, forceRefresh = false): Promise<string> => {
  const token = await getToken({ skipCache: forceRefresh });
  if (!token) throw new Error('Your Clerk session is not ready. Sign in again.');
  return token;
};

const getClerkTokenTime = (value: unknown): string => typeof value === 'number' ? new Date(value * 1000).toUTCString() : '';

const createClerkTokenResult = async (getToken: ClerkGetToken): Promise<IdTokenResult> => {
  const token = await getClerkSessionToken(getToken);
  const claims = decodeClerkTokenClaims(token);
  return {
    claims, token, authTime: getClerkTokenTime(claims.auth_time),
    issuedAtTime: getClerkTokenTime(claims.iat), expirationTime: getClerkTokenTime(claims.exp),
    signInProvider: typeof claims.firebase?.sign_in_provider === 'string' ? claims.firebase.sign_in_provider : null,
    signInSecondFactor: null,
  };
};

const createClerkExternalProviderData = (
  account: NonNullable<ClerkUserResource['externalAccounts']>[number],
  displayName: string | null,
  email: string | null,
  photoURL: string | null,
): User['providerData'][number] => ({
  uid: account.id,
  displayName: account.username ?? displayName,
  email: account.emailAddress ?? email,
  phoneNumber: null,
  photoURL: account.imageUrl ?? photoURL,
  providerId: account.provider === 'google' ? 'google.com' : `${account.provider}.com`,
});

const createClerkProviderData = (
  clerkUser: ClerkUserResource,
  displayName: string | null,
  email: string | null,
  photoURL: string | null,
): User['providerData'] => {
  const passwordProvider = clerkUser.passwordEnabled ? [{
    uid: clerkUser.id, displayName, email, phoneNumber: null, photoURL, providerId: 'password',
  } as User['providerData'][number]] : [];
  const externalProviders = (clerkUser.externalAccounts ?? []).map((account) =>
    createClerkExternalProviderData(account, displayName, email, photoURL));
  return [...passwordProvider, ...externalProviders];
};

const getClerkDisplayName = (clerkUser: ClerkUserResource): string | null =>
  [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;

const isClerkEmailVerified = (clerkUser: ClerkUserResource): boolean =>
  clerkUser.primaryEmailAddress?.verification?.status === 'verified';

const createClerkUserMetadata = (clerkUser: ClerkUserResource) => ({
  creationTime: clerkUser.createdAt?.toISOString() ?? null,
  lastSignInTime: clerkUser.lastSignInAt?.toISOString() ?? null,
});

const createClerkUserJson = (clerkUser: ClerkUserResource, email: string | null, displayName: string | null, photoURL: string | null) => ({
  uid: clerkUser.id,
  email,
  displayName,
  photoURL,
  emailVerified: isClerkEmailVerified(clerkUser),
});

const createClerkUserFacade = (
  clerkUser: ClerkUserResource | null | undefined,
  getToken: ClerkGetToken,
  deleteClerkUser: () => Promise<void>,
): User | null => {
  if (!clerkUser) return null;
  const displayName = getClerkDisplayName(clerkUser);
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
  const photoURL = clerkUser.imageUrl || null;
  return {
    uid: clerkUser.id,
    email,
    displayName,
    photoURL,
    emailVerified: isClerkEmailVerified(clerkUser),
    isAnonymous: false,
    metadata: createClerkUserMetadata(clerkUser),
    phoneNumber: clerkUser.primaryPhoneNumber?.phoneNumber ?? null,
    refreshToken: '',
    tenantId: null,
    providerData: createClerkProviderData(clerkUser, displayName, email, photoURL),
    getIdToken: (forceRefresh?: boolean) => getClerkSessionToken(getToken, Boolean(forceRefresh)),
    getIdTokenResult: () => createClerkTokenResult(getToken),
    reload: async () => { await clerkUser.reload(); },
    delete: async () => { await deleteClerkUser(); },
    toJSON: () => createClerkUserJson(clerkUser, email, displayName, photoURL),
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

type ClerkSettingsWriteContext = {
  queueRef: React.MutableRefObject<Promise<void>>;
  currentUserId: string | undefined;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  settings: UserSettingsDocument;
  userId: string;
  signal?: AbortSignal;
};

const putClerkSettings = async (context: ClerkSettingsWriteContext): Promise<Response> => {
  const { queueRef, currentUserId, request, settings, userId, signal } = context;
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

const clerkResponseError = (body: Record<string, unknown>, fallback: string): string =>
  typeof body.error === 'string' && body.error ? body.error : fallback;

const readClerkBetaAccess = (body: Record<string, unknown>): boolean => {
  const user = body.user;
  return typeof user === 'object' && user !== null && 'betaAccess' in user ? Boolean(user.betaAccess) : false;
};

const applyClerkBootstrapSettings = (body: Record<string, unknown>, context: ClerkBootstrapContext): void => {
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

const applyClerkBootstrapResponse = (body: Record<string, unknown>, requestId: number, context: ClerkBootstrapContext): void => {
  if (requestId !== context.betaAccessRequestIdRef.current) return;
  context.setBetaAccess(readClerkBetaAccess(body));
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

type ClerkBootstrapRequest = { abortController: AbortController; requestId: number };

const beginClerkBootstrapRequest = (context: ClerkBootstrapContext): ClerkBootstrapRequest | null => {
  context.betaAccessAbortRef.current?.abort();
  const abortController = new AbortController();
  context.betaAccessAbortRef.current = abortController;
  const requestId = ++context.betaAccessRequestIdRef.current;
  if (!context.isSignedIn || !context.clerkUserId) {
    context.setBetaAccess(false);
    context.setBetaAccessLoading(false);
    if (context.betaAccessAbortRef.current === abortController) context.betaAccessAbortRef.current = null;
    return null;
  }
  context.setBetaAccessLoading(true);
  return { abortController, requestId };
};

const loadClerkBetaAccess = async (
  context: ClerkBootstrapContext,
  bootstrap: ClerkBootstrapRequest,
): Promise<void> => {
  const { abortController, requestId } = bootstrap;
  try {
    const response = await context.request('/api/me/bootstrap', { signal: abortController.signal });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(clerkResponseError(body, 'Unable to load your beta account.'));
    applyClerkBootstrapResponse(body, requestId, context);
  } catch (error) {
    applyClerkBootstrapFailure(error, requestId, context);
  } finally {
    if (requestId === context.betaAccessRequestIdRef.current) context.setBetaAccessLoading(false);
    if (context.betaAccessAbortRef.current === abortController) context.betaAccessAbortRef.current = null;
  }
};

const refreshClerkBetaAccess = async (context: ClerkBootstrapContext): Promise<void> => {
  const bootstrap = beginClerkBootstrapRequest(context);
  if (bootstrap) await loadClerkBetaAccess(context, bootstrap);
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

type ClerkSettingsSyncRequest = { active: boolean; requestId: number; userId: string; next: UserSettingsDocument; signal: AbortSignal };

const isActiveClerkSettingsSync = (context: ClerkSettingsSyncContext, request: ClerkSettingsSyncRequest): boolean =>
  isCurrentClerkSettingsSync({
    active: request.active,
    requestId: request.requestId,
    latestRequestId: context.settingsRequestIdRef.current,
    isSignedIn: Boolean(context.isSignedIn),
    userId: request.userId,
    currentUserId: context.currentUser?.uid ?? '',
    bootstrapKey: context.bootstrapKey,
  });

const applyClerkSettingsSyncSuccess = (
  context: ClerkSettingsSyncContext,
  request: ClerkSettingsSyncRequest,
): void => {
  if (!isActiveClerkSettingsSync(context, request)) return;
  context.lastSyncedSettingsRef.current = request.next;
  context.setSyncedSettings(request.next);
  context.setSettingsSyncStatus('synced');
};

const applyClerkSettingsSyncFailure = (
  context: ClerkSettingsSyncContext,
  request: ClerkSettingsSyncRequest,
  error: unknown,
): void => {
  if (!isActiveClerkSettingsSync(context, request)) return;
  context.setSettingsSyncStatus('error');
  context.setError(error instanceof Error ? error.message : 'Unable to sync account settings.');
};

const persistClerkSettingsSync = async (
  context: ClerkSettingsSyncContext,
  request: ClerkSettingsSyncRequest,
): Promise<void> => {
  try {
    const response = await context.putSettings(request.next, request.userId, request.signal);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Unable to sync account settings.');
    applyClerkSettingsSyncSuccess(context, request);
  } catch (error) {
    applyClerkSettingsSyncFailure(context, request, error);
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

type ClerkAuthStatusContext = {
  isLoaded: boolean;
  isUserLoaded: boolean;
  error: string | null;
  isSignedIn: boolean | undefined;
  hasInitializedSettings: boolean;
  currentUser: User | null;
};

const resolveClerkAuthStatus = (context: ClerkAuthStatusContext): AuthStatus => {
  if (!context.isLoaded) return 'loading';
  if (!context.isUserLoaded) return 'loading';
  const hasBootstrapError = [Boolean(context.error), Boolean(context.isSignedIn), !context.hasInitializedSettings].every(Boolean);
  if (hasBootstrapError) return 'error';
  if (!context.isSignedIn) return 'signed_out';
  return context.currentUser ? 'signed_in' : 'signed_out';
};

const useClerkSession = () => {
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
    if (isLoaded) setBetaApiTokenProvider(isSignedIn ? betaTokenProviderRef.current : null);
  }, [clerkUser?.id, isLoaded, isSignedIn]);
  return { isLoaded, isSignedIn, isUserLoaded, getToken, clerk, clerkUser, clerkIdentityRef, deleteClerkUser };
};

const useClerkPreferences = () => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const overlays = useSelector((state: RootState) => state.overlays);
  const monitorSettings = useSelector((state: RootState) => state.monitor);
  const currentDarkModeRef = useRef(darkMode);
  const currentOverlaysRef = useRef(overlays);
  useEffect(() => { currentDarkModeRef.current = darkMode; }, [darkMode]);
  useEffect(() => { currentOverlaysRef.current = overlays; }, [overlays]);
  return { dispatch, darkMode, overlays, monitorSettings, currentDarkModeRef, currentOverlaysRef };
};

type ClerkProviderStateContext = {
  isSignedIn: boolean | undefined;
  clerkUserId: string | undefined;
  dispatch: ReturnType<typeof useDispatch>;
};

const useClerkProviderState = (context: ClerkProviderStateContext) => {
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
  const hasInitializedSettingsRef = useRef(false);
  const betaAccessAbortRef = useRef<AbortController | null>(null);

  useEffect(() => { bootstrapKeyRef.current = bootstrapKey; }, [bootstrapKey]);
  const accountSwitchContext = useMemo<ClerkAccountSwitchContext>(() => ({
    isSignedIn: context.isSignedIn, clerkUserId: context.clerkUserId, bootstrapKey,
    dispatch: context.dispatch, betaAccessRequestIdRef, betaAccessAbortRef, settingsRequestIdRef,
    settingsWriteQueueRef, lastSyncedSettingsRef, hasInitializedSettingsRef,
    setSettingsSyncStatus, setSyncedSettings, setBetaAccess, setBetaAccessLoading, setBootstrapKey, setError,
  }), [bootstrapKey, context.clerkUserId, context.dispatch, context.isSignedIn,
    betaAccessRequestIdRef, betaAccessAbortRef, settingsRequestIdRef, settingsWriteQueueRef,
    lastSyncedSettingsRef, hasInitializedSettingsRef, setSettingsSyncStatus, setSyncedSettings,
    setBetaAccess, setBetaAccessLoading, setBootstrapKey, setError]);
  useEffect(() => resetClerkStateForAccountSwitch(accountSwitchContext), [accountSwitchContext]);
  return {
    syncedSettings, setSyncedSettings, settingsSyncStatus, setSettingsSyncStatus,
    betaAccess, setBetaAccess, betaAccessLoading, setBetaAccessLoading, error, setError,
    bootstrapKey, setBootstrapKey, bootstrapKeyRef, lastSyncedSettingsRef, betaAccessRequestIdRef,
    settingsRequestIdRef, settingsWriteQueueRef, hasInitializedSettingsRef, betaAccessAbortRef,
  };
};

type ClerkProviderApiContext = {
  clerkUserId: string | undefined;
  isSignedIn: boolean | undefined;
  getToken: ClerkGetToken;
  identityRef: React.MutableRefObject<{ isSignedIn: boolean; userId: string | undefined }>;
  settingsWriteQueueRef: React.MutableRefObject<Promise<void>>;
};

const useClerkProviderApi = (context: ClerkProviderApiContext) => {
  const requestContext = useMemo<ClerkRequestContext>(() => ({
    clerkUserId: context.clerkUserId, isSignedIn: context.isSignedIn,
    getToken: context.getToken, identityRef: context.identityRef,
  }), [context.clerkUserId, context.getToken, context.identityRef, context.isSignedIn]);
  const request = useCallback((path: string, init: RequestInit = {}) =>
    requestClerkBetaApi(requestContext, path, init), [requestContext]);
  const putSettings = useCallback((settings: UserSettingsDocument, userId: string, signal?: AbortSignal) =>
    putClerkSettings({
      queueRef: context.settingsWriteQueueRef, currentUserId: context.clerkUserId,
      request, settings, userId, signal,
    }), [context.clerkUserId, context.settingsWriteQueueRef, request]);
  return { request, putSettings };
};

type ClerkProviderBootstrapContext = {
  session: ReturnType<typeof useClerkSession>;
  preferences: ReturnType<typeof useClerkPreferences>;
  state: ReturnType<typeof useClerkProviderState>;
  request: ClerkBootstrapContext['request'];
};

const useClerkBetaAccess = (context: ClerkProviderBootstrapContext) => {
  const { session, preferences, state, request } = context;
  const bootstrapContext = useMemo<ClerkBootstrapContext>(() => ({
    isSignedIn: session.isSignedIn, clerkUserId: session.clerkUser?.id, clerkUser: session.clerkUser,
    monitorSettings: preferences.monitorSettings, request, dispatch: preferences.dispatch,
    currentDarkModeRef: preferences.currentDarkModeRef, currentOverlaysRef: preferences.currentOverlaysRef,
    betaAccessRequestIdRef: state.betaAccessRequestIdRef, betaAccessAbortRef: state.betaAccessAbortRef,
    bootstrapKeyRef: state.bootstrapKeyRef, lastSyncedSettingsRef: state.lastSyncedSettingsRef,
    hasInitializedSettingsRef: state.hasInitializedSettingsRef, setBetaAccess: state.setBetaAccess,
    setBetaAccessLoading: state.setBetaAccessLoading, setSyncedSettings: state.setSyncedSettings,
    setSettingsSyncStatus: state.setSettingsSyncStatus, setBootstrapKey: state.setBootstrapKey, setError: state.setError,
  }), [session.isSignedIn, session.clerkUser,
    preferences.monitorSettings, request, preferences.dispatch, preferences.currentDarkModeRef,
    preferences.currentOverlaysRef, state.betaAccessRequestIdRef, state.betaAccessAbortRef,
    state.bootstrapKeyRef, state.lastSyncedSettingsRef, state.hasInitializedSettingsRef,
    state.setBetaAccess, state.setBetaAccessLoading, state.setSyncedSettings,
    state.setSettingsSyncStatus, state.setBootstrapKey, state.setError]);
  const refreshBetaAccess = useCallback(() => refreshClerkBetaAccess(bootstrapContext), [bootstrapContext]);
  const lifecycleContext = useMemo<ClerkBootstrapLifecycleContext>(() => ({
    clerkUserId: session.clerkUser?.id,
    betaAccessRequestIdRef: state.betaAccessRequestIdRef, betaAccessAbortRef: state.betaAccessAbortRef,
    lastSyncedSettingsRef: state.lastSyncedSettingsRef, hasInitializedSettingsRef: state.hasInitializedSettingsRef,
    setSyncedSettings: state.setSyncedSettings, setSettingsSyncStatus: state.setSettingsSyncStatus,
    setBetaAccess: state.setBetaAccess, setBetaAccessLoading: state.setBetaAccessLoading,
    setBootstrapKey: state.setBootstrapKey, setError: state.setError,
    isLoaded: session.isLoaded, isUserLoaded: session.isUserLoaded, isSignedIn: session.isSignedIn, refreshBetaAccess,
  }), [session.clerkUser?.id, session.isLoaded, session.isSignedIn, session.isUserLoaded, refreshBetaAccess,
    state.betaAccessRequestIdRef, state.betaAccessAbortRef, state.lastSyncedSettingsRef,
    state.hasInitializedSettingsRef, state.setSyncedSettings, state.setSettingsSyncStatus,
    state.setBetaAccess, state.setBetaAccessLoading, state.setBootstrapKey, state.setError]);
  useEffect(() => runClerkBootstrapLifecycle(lifecycleContext), [lifecycleContext]);
  return refreshBetaAccess;
};

type ClerkProviderSettingsContext = {
  session: ReturnType<typeof useClerkSession>;
  preferences: ReturnType<typeof useClerkPreferences>;
  state: ReturnType<typeof useClerkProviderState>;
  currentUser: User | null;
  putSettings: ClerkSettingsSyncContext['putSettings'];
};

const useClerkSettings = (context: ClerkProviderSettingsContext) => {
  const { session, preferences, state, currentUser, putSettings } = context;
  const settingsUpdateContext = useMemo<ClerkSettingsUpdateContext>(() => ({
    currentUser, bootstrapKey: state.bootstrapKey, hasInitializedSettingsRef: state.hasInitializedSettingsRef,
    settingsRequestIdRef: state.settingsRequestIdRef, lastSyncedSettingsRef: state.lastSyncedSettingsRef,
    darkMode: preferences.darkMode, overlays: preferences.overlays, monitorSettings: preferences.monitorSettings,
    syncedSettings: state.syncedSettings, putSettings, clerkIdentityRef: session.clerkIdentityRef,
    setSettingsSyncStatus: state.setSettingsSyncStatus, setError: state.setError, setSyncedSettings: state.setSyncedSettings,
  }), [currentUser, state.bootstrapKey, state.hasInitializedSettingsRef, state.settingsRequestIdRef,
    state.lastSyncedSettingsRef, preferences.darkMode, preferences.overlays, preferences.monitorSettings,
    state.syncedSettings, putSettings, session.clerkIdentityRef, state.setSettingsSyncStatus,
    state.setError, state.setSyncedSettings]);
  const updateSyncedSettings = useCallback((patch: Partial<UserSettingsDocument>) =>
    updateClerkSyncedSettings(settingsUpdateContext, patch), [settingsUpdateContext]);
  const settingsSyncContext = useMemo<ClerkSettingsSyncContext>(() => ({
    bootstrapKey: state.bootstrapKey, currentUser, hasInitializedSettingsRef: state.hasInitializedSettingsRef,
    isSignedIn: session.isSignedIn, darkMode: preferences.darkMode, overlays: preferences.overlays,
    monitorSettings: preferences.monitorSettings, syncedSettings: state.syncedSettings,
    lastSyncedSettingsRef: state.lastSyncedSettingsRef, settingsRequestIdRef: state.settingsRequestIdRef,
    putSettings, setSyncedSettings: state.setSyncedSettings, setSettingsSyncStatus: state.setSettingsSyncStatus,
    setError: state.setError,
  }), [state.bootstrapKey, currentUser, state.hasInitializedSettingsRef, session.isSignedIn,
    preferences.darkMode, preferences.overlays, preferences.monitorSettings, state.syncedSettings,
    state.lastSyncedSettingsRef, state.settingsRequestIdRef, putSettings, state.setSyncedSettings,
    state.setSettingsSyncStatus, state.setError]);
  useEffect(() => startClerkSettingsSync(settingsSyncContext), [settingsSyncContext]);
  return updateSyncedSettings;
};

type ClerkProviderActionsContext = {
  session: ReturnType<typeof useClerkSession>;
  state: ReturnType<typeof useClerkProviderState>;
  refreshBetaAccess: () => Promise<void>;
};

type ClerkAccountResetContext = Pick<ReturnType<typeof useClerkProviderState>,
  'betaAccessRequestIdRef' | 'settingsRequestIdRef' | 'settingsWriteQueueRef' | 'setBetaAccess'
  | 'setBetaAccessLoading' | 'setBootstrapKey' | 'setSyncedSettings' | 'setSettingsSyncStatus'
  | 'lastSyncedSettingsRef' | 'hasInitializedSettingsRef'>;

const resetClerkAccountState = (state: ClerkAccountResetContext): void => {
  setBetaApiTokenProvider(null);
  state.betaAccessRequestIdRef.current += 1;
  state.settingsRequestIdRef.current += 1;
  state.settingsWriteQueueRef.current = Promise.resolve();
  state.setBetaAccess(false);
  state.setBetaAccessLoading(false);
  state.setBootstrapKey('');
  state.setSyncedSettings(null);
  state.setSettingsSyncStatus('idle');
  state.lastSyncedSettingsRef.current = null;
  state.hasInitializedSettingsRef.current = false;
};

const useClerkAccountActions = (context: ClerkProviderActionsContext) => {
  const { session, state, refreshBetaAccess } = context;
  const resetAccountState = useCallback(() => resetClerkAccountState({
    betaAccessRequestIdRef: state.betaAccessRequestIdRef,
    settingsRequestIdRef: state.settingsRequestIdRef,
    settingsWriteQueueRef: state.settingsWriteQueueRef,
    setBetaAccess: state.setBetaAccess,
    setBetaAccessLoading: state.setBetaAccessLoading,
    setBootstrapKey: state.setBootstrapKey,
    setSyncedSettings: state.setSyncedSettings,
    setSettingsSyncStatus: state.setSettingsSyncStatus,
    lastSyncedSettingsRef: state.lastSyncedSettingsRef,
    hasInitializedSettingsRef: state.hasInitializedSettingsRef,
  }), [state.betaAccessRequestIdRef, state.settingsRequestIdRef, state.settingsWriteQueueRef,
    state.setBetaAccess, state.setBetaAccessLoading, state.setBootstrapKey, state.setSyncedSettings,
    state.setSettingsSyncStatus, state.lastSyncedSettingsRef, state.hasInitializedSettingsRef]);
  const signOutUser = useCallback(() => runClerkAccountAction({
    action: () => session.clerk.signOut(), fallbackMessage: 'Unable to sign out right now.',
    refreshBetaAccess, resetAccountState,
    setBetaAccess: state.setBetaAccess, setBetaAccessLoading: state.setBetaAccessLoading, setError: state.setError,
  }), [session.clerk, refreshBetaAccess, resetAccountState, state.setBetaAccess, state.setBetaAccessLoading, state.setError]);
  const deleteAccount = useCallback(() => runClerkAccountAction({
    action: session.deleteClerkUser, fallbackMessage: 'Unable to delete your account right now.',
    refreshBetaAccess, resetAccountState,
    setBetaAccess: state.setBetaAccess, setBetaAccessLoading: state.setBetaAccessLoading, setError: state.setError,
  }), [session.deleteClerkUser, refreshBetaAccess, resetAccountState, state.setBetaAccess, state.setBetaAccessLoading, state.setError]);
  return { signOutUser, deleteAccount };
};

/** Provides Clerk sessions and the beta Worker profile/settings API for the Clerk+D1 beta build. */
export const ClerkAuthContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const session = useClerkSession();
  const preferences = useClerkPreferences();
  const state = useClerkProviderState({
    isSignedIn: session.isSignedIn, clerkUserId: session.clerkUser?.id,
    dispatch: preferences.dispatch,
  });
  const { request, putSettings } = useClerkProviderApi({
    clerkUserId: session.clerkUser?.id, isSignedIn: session.isSignedIn,
    getToken: session.getToken, identityRef: session.clerkIdentityRef, settingsWriteQueueRef: state.settingsWriteQueueRef,
  });
  const refreshBetaAccess = useClerkBetaAccess({ session, preferences, state, request });
  const currentUser = useMemo(
    () => createClerkUserFacade(session.clerkUser, session.getToken, session.deleteClerkUser),
    [session.clerkUser, session.deleteClerkUser, session.getToken],
  );
  const updateSyncedSettings = useClerkSettings({ session, preferences, state, currentUser, putSettings });
  const { signOutUser, deleteAccount } = useClerkAccountActions({ session, state, refreshBetaAccess });
  const hasInitializedSettings = Boolean(currentUser && state.bootstrapKey === currentUser.uid && state.hasInitializedSettingsRef.current);
  const authStatus = resolveClerkAuthStatus({
    isLoaded: session.isLoaded, isUserLoaded: session.isUserLoaded, error: state.error,
    isSignedIn: session.isSignedIn, hasInitializedSettings, currentUser,
  });

  const value = useMemo<AuthContextValue>(() => ({
    status: authStatus,
    settingsSyncStatus: state.settingsSyncStatus,
    user: currentUser,
    authProvider: 'clerk',
    syncedSettings: state.bootstrapKey === currentUser?.uid ? state.syncedSettings : null,
    error: state.error,
    hostedAuthEnabled: typeof __GFC_CLERK_PUBLISHABLE_KEY__ !== 'undefined' && Boolean(__GFC_CLERK_PUBLISHABLE_KEY__),
    betaAccess: state.betaAccess,
    betaAccessLoading: state.betaAccessLoading,
    signInWithGoogle: disabledAuthAction,
    signInWithEmail: disabledAuthAction,
    signUpWithEmail: disabledAuthAction,
    signOutUser,
    deleteAccount,
    updateSyncedSettings,
    refreshBetaAccess,
  }), [authStatus, state.settingsSyncStatus, currentUser, state.bootstrapKey, state.syncedSettings,
    state.error, state.betaAccess, state.betaAccessLoading, deleteAccount, refreshBetaAccess, signOutUser, updateSyncedSettings]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


