/**
 * Hosted-auth profile synchronization helpers. The module reads and writes the
 * hosted user settings document and exposes typed actions for account state.
 */
import type { User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  createProfilePayload,
  getRemoteSeedPayload,
  getSettingsSyncError,
  readRemoteSettings,
  type UserSettingsDocument,
} from './authSettings';

/** The hosted settings synchronization states shown by the auth context. */
export type SettingsSyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'error';

/** Creates or updates a hosted profile while preserving its original creation timestamp. */
export const syncProfileDocument = async (profileRef: ReturnType<typeof doc>, user: User): Promise<void> => {
  const profileSnapshot = await getDoc(profileRef);
  const needsCreatedAt = !profileSnapshot.exists() || profileSnapshot.data()?.createdAt === undefined;
  await setDoc(
    profileRef,
    createProfilePayload(user, { includeCreatedAt: needsCreatedAt }),
    { merge: true },
  );
};

/** Reuses remote settings or seeds Firestore from the current local settings snapshot. */
export const seedOrApplySettings = async (opts: {
  settingsRef: ReturnType<typeof doc>;
  settingsSnapshot: Awaited<ReturnType<typeof getDoc>>;
  localSettings: UserSettingsDocument;
  applyRemoteSettings: (settings: UserSettingsDocument) => void;
  isActive: () => boolean;
  lastSyncedSettingsRef: MutableRefObject<UserSettingsDocument | null>;
  setSyncedSettings: Dispatch<SetStateAction<UserSettingsDocument | null>>;
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

  if (!isActive()) return;
  if (remoteSettings) {
    applyRemoteSettings(remoteSettings);
    return;
  }

  await setDoc(
    settingsRef,
    getRemoteSeedPayload(localSettings, { includeCreatedAt: !settingsSnapshot.exists() }),
    { merge: true },
  );

  if (!isActive()) return;
  lastSyncedSettingsRef.current = localSettings;
  setSyncedSettings(localSettings);
};

/** Starts the live Firestore listener that mirrors hosted settings into local state. */
export const startSettingsSubscription = (opts: {
  settingsRef: ReturnType<typeof doc>;
  isActive: () => boolean;
  applyRemoteSettings: (settings: UserSettingsDocument) => void;
  setSettingsSyncStatus: Dispatch<SetStateAction<SettingsSyncStatus>>;
  setError: Dispatch<SetStateAction<string | null>>;
}): Unsubscribe =>
  onSnapshot(
    opts.settingsRef,
    (snapshot) => {
      const nextSettings = readRemoteSettings(snapshot.data() as Partial<UserSettingsDocument> | undefined);
      if (!opts.isActive() || !nextSettings) return;

      opts.applyRemoteSettings(nextSettings);
      opts.setSettingsSyncStatus('synced');
    },
    (snapshotError) => {
      if (!opts.isActive()) return;
      opts.setSettingsSyncStatus('error');
      opts.setError(snapshotError.message);
    },
  );

/** Runs the initial hosted profile/settings sync before the live subscription takes over. */
export const runInitialHostedSync = async (opts: {
  profileRef: ReturnType<typeof doc>;
  settingsRef: ReturnType<typeof doc>;
  user: User;
  buildLocalSettingsSnapshot: () => UserSettingsDocument;
  applyRemoteSettings: (settings: UserSettingsDocument) => void;
  isActive: () => boolean;
  lastSyncedSettingsRef: MutableRefObject<UserSettingsDocument | null>;
  setSyncedSettings: Dispatch<SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: Dispatch<SetStateAction<SettingsSyncStatus>>;
  setError: Dispatch<SetStateAction<string | null>>;
  hasInitializedSettingsRef: MutableRefObject<boolean>;
}): Promise<Unsubscribe | undefined> => {
  opts.setSettingsSyncStatus('syncing');

  try {
    await syncProfileDocument(opts.profileRef, opts.user);
    const settingsSnapshot = await getDoc(opts.settingsRef);
    await seedOrApplySettings({
      settingsRef: opts.settingsRef,
      settingsSnapshot,
      localSettings: opts.buildLocalSettingsSnapshot(),
      applyRemoteSettings: opts.applyRemoteSettings,
      isActive: opts.isActive,
      lastSyncedSettingsRef: opts.lastSyncedSettingsRef,
      setSyncedSettings: opts.setSyncedSettings,
    });

    if (!opts.isActive()) return undefined;
    opts.hasInitializedSettingsRef.current = true;
    opts.setSettingsSyncStatus('synced');

    return startSettingsSubscription({
      settingsRef: opts.settingsRef,
      isActive: opts.isActive,
      applyRemoteSettings: opts.applyRemoteSettings,
      setSettingsSyncStatus: opts.setSettingsSyncStatus,
      setError: opts.setError,
    });
  } catch (syncError) {
    if (opts.isActive()) {
      opts.setSettingsSyncStatus('error');
      opts.setError(getSettingsSyncError(syncError));
    }
    return undefined;
  }
};

/** Stores a late-created listener only while its effect is still active. */
export const attachHostedSettingsSubscription = (
  subscriptionPromise: Promise<Unsubscribe | undefined>,
  isActive: () => boolean,
  setSubscription: (unsubscribe: Unsubscribe) => void,
): Promise<void> => subscriptionPromise.then((nextUnsubscribe) => {
  if (!isActive()) {
    nextUnsubscribe?.();
    return;
  }
  if (nextUnsubscribe) setSubscription(nextUnsubscribe);
});
