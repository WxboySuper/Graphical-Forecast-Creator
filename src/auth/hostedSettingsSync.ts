import React from 'react';
import { useDispatch } from 'react-redux';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { setDarkMode } from '../store/themeSlice';
import { applyOverlaySettings } from '../store/overlaysSlice';
import type { OverlaysState } from '../store/overlaysSlice';
import { applyMonitorSettings } from '../store/monitorSlice';
import { writeStoredForecastUiVariant } from '../utils/forecastUiVariant';
import {
  areUserSettingsEqual,
  readRemoteSettings,
  type UserSettingsDocument,
} from './userSettingsDocument';
import { areMonitorSettingsEqual } from '../monitor/types';
import { getSettingsSyncError } from './authSyncErrors';

export type SettingsSyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'error';

/** True when the current overlay state already matches the incoming synced overlay values. */
export const areOverlaySettingsEqual = (
  current: OverlaysState,
  incoming: Pick<UserSettingsDocument, 'baseMapStyle' | 'stateBorders' | 'counties' | 'ghostOutlooks'>,
): boolean =>
  current.baseMapStyle === incoming.baseMapStyle &&
  current.stateBorders === incoming.stateBorders &&
  current.counties === incoming.counties &&
  JSON.stringify(current.ghostOutlooks) === JSON.stringify(incoming.ghostOutlooks);

/** Tracks an in-flight debounced settings write so stale snapshots can be ignored safely. */
export interface PendingHostedSettingsWrite {
  writeSequence: number;
  baseline: UserSettingsDocument;
  target: UserSettingsDocument;
}

export interface HostedSettingsSnapshotMetadata {
  hasPendingWrites: boolean;
}

const USER_SETTINGS_DOCUMENT_KEYS: (keyof UserSettingsDocument)[] = [
  'darkMode',
  'baseMapStyle',
  'stateBorders',
  'counties',
  'ghostOutlooks',
  'defaultForecasterName',
  'forecastUiVariant',
  'monitorSettings',
];

/** Compares one normalized settings field between two documents. */
export const isUserSettingsDocumentFieldEqual = (
  key: keyof UserSettingsDocument,
  left: UserSettingsDocument[keyof UserSettingsDocument],
  right: UserSettingsDocument[keyof UserSettingsDocument],
): boolean => {
  if (key === 'ghostOutlooks') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  if (key === 'monitorSettings') {
    return areMonitorSettingsEqual(
      left as UserSettingsDocument['monitorSettings'],
      right as UserSettingsDocument['monitorSettings'],
    );
  }
  return left === right;
};

/** Tracks a hosted settings document currently being written to Firestore. */
export interface InFlightHostedSettingsWrite {
  writeSequence: number;
  target: UserSettingsDocument;
}

/**
 * While a local write is pending, keep locally edited fields on the pending target when the
 * remote snapshot still carries the pre-change value or an in-flight write target that was
 * superseded by a newer local selection.
 */
export const coalesceRemoteSettingsWithPendingLocal = (
  remote: UserSettingsDocument,
  pendingWrite: PendingHostedSettingsWrite,
  inFlightWriteTarget: UserSettingsDocument | null = null,
): UserSettingsDocument => {
  const { baseline, target } = pendingWrite;
  const coalesced: UserSettingsDocument = { ...remote };

  for (const key of USER_SETTINGS_DOCUMENT_KEYS) {
    if (isUserSettingsDocumentFieldEqual(key, baseline[key], target[key])) {
      continue;
    }
    if (isUserSettingsDocumentFieldEqual(key, remote[key], baseline[key])) {
      coalesced[key] = target[key] as never;
      continue;
    }
    if (
      inFlightWriteTarget
      && isUserSettingsDocumentFieldEqual(key, remote[key], inFlightWriteTarget[key])
    ) {
      coalesced[key] = target[key] as never;
    }
  }

  return coalesced;
};

/** Firestore local-write echoes should not overwrite Redux; the UI already reflects the edit. */
export const shouldIgnoreHostedSettingsSnapshot = (
  metadata: HostedSettingsSnapshotMetadata,
): boolean => metadata.hasPendingWrites;

/** Applies pending-local coalescing before hosted settings are merged into Redux. */
export const resolveHostedSettingsFromSnapshot = (
  remote: UserSettingsDocument,
  pendingWrite: PendingHostedSettingsWrite | null,
  inFlightWriteTarget: UserSettingsDocument | null = null,
): UserSettingsDocument =>
  pendingWrite
    ? coalesceRemoteSettingsWithPendingLocal(remote, pendingWrite, inFlightWriteTarget)
    : remote;

/**
 * Ignores at most one post-write snapshot that still matches the superseded baseline
 * (cached echo). Any other snapshot clears the guard so another device can apply.
 */
export const consumeSupersededBaselineOneShotIgnore = (
  remote: UserSettingsDocument,
  oneShotBaseline: UserSettingsDocument | null,
  clearOneShot: () => void,
): boolean => {
  if (!oneShotBaseline) {
    return false;
  }

  if (areUserSettingsEqual(remote, oneShotBaseline)) {
    clearOneShot();
    return true;
  }

  clearOneShot();
  return false;
};

/** Clears a debounced hosted settings write and its pending local intent. */
export const cancelPendingHostedSettingsWriteIntent = (
  pendingDebounceTimerRef: React.MutableRefObject<number | null>,
  pendingLocalSettingsIntentRef: React.MutableRefObject<PendingHostedSettingsWrite | null>,
): void => {
  if (pendingDebounceTimerRef.current) {
    window.clearTimeout(pendingDebounceTimerRef.current);
    pendingDebounceTimerRef.current = null;
  }
  pendingLocalSettingsIntentRef.current = null;
};

/**
 * True when local settings already match the acknowledgement baseline (in-flight write
 * target when present, otherwise last synced). Used to avoid cancelling a revert while
 * an older write is still in flight.
 */
export const shouldSkipHostedSettingsDocumentWrite = (
  nextSettings: UserSettingsDocument,
  lastSynced: UserSettingsDocument | null,
  inFlightWrite: InFlightHostedSettingsWrite | null,
): boolean => {
  const comparisonBaseline = inFlightWrite?.target ?? lastSynced;
  if (!comparisonBaseline) {
    return false;
  }
  return areUserSettingsEqual(comparisonBaseline, nextSettings);
};

export interface FinalizeHostedSettingsWriteFailureOptions {
  pendingLocalSettingsIntentRef: React.MutableRefObject<PendingHostedSettingsWrite | null>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  capturedWriteSequence: number;
  isWriteOwnerActive: () => boolean;
  onPersistError: (error: unknown) => void;
  error: unknown;
}

/** Clears or rebases pending intent after a failed hosted settings write. */
export const finalizeHostedSettingsWriteFailure = (
  options: FinalizeHostedSettingsWriteFailureOptions,
): void => {
  const {
    pendingLocalSettingsIntentRef,
    lastSyncedSettingsRef,
    capturedWriteSequence,
    isWriteOwnerActive,
    onPersistError,
    error,
  } = options;
  const pending = pendingLocalSettingsIntentRef.current;
  if (pending?.writeSequence === capturedWriteSequence) {
    pendingLocalSettingsIntentRef.current = null;
  } else if (pending && pending.writeSequence > capturedWriteSequence) {
    const rebasedBaseline = lastSyncedSettingsRef.current ?? pending.baseline;
    pendingLocalSettingsIntentRef.current = {
      ...pending,
      baseline: rebasedBaseline,
    };
  }
  if (isWriteOwnerActive()) {
    onPersistError(error);
  }
};

export interface UpdatePendingHostedSettingsWriteTargetOptions {
  pendingWriteRef: React.MutableRefObject<PendingHostedSettingsWrite | null>;
  writeSequenceRef: React.MutableRefObject<number>;
  lastSynced: UserSettingsDocument | null;
  nextTarget: UserSettingsDocument;
  inFlightWriteTarget: UserSettingsDocument | null;
}

/** Starts or updates the pending hosted write intent for a debounced settings save. */
export const updatePendingHostedSettingsWriteTarget = (
  options: UpdatePendingHostedSettingsWriteTargetOptions,
): PendingHostedSettingsWrite => {
  const {
    pendingWriteRef,
    writeSequenceRef,
    lastSynced,
    nextTarget,
    inFlightWriteTarget,
  } = options;
  const nextSequence = writeSequenceRef.current + 1;
  writeSequenceRef.current = nextSequence;
  const baselineForNewIntent = inFlightWriteTarget ?? lastSynced ?? nextTarget;

  const existing = pendingWriteRef.current;
  if (existing) {
    const updated: PendingHostedSettingsWrite = {
      baseline: inFlightWriteTarget ?? existing.baseline,
      target: nextTarget,
      writeSequence: nextSequence,
    };
    pendingWriteRef.current = updated;
    return updated;
  }

  const created: PendingHostedSettingsWrite = {
    baseline: baselineForNewIntent,
    target: nextTarget,
    writeSequence: nextSequence,
  };
  pendingWriteRef.current = created;
  return created;
};

export interface ScheduleHostedSettingsWriteArgs {
  nextSettings: UserSettingsDocument;
  debounceMs: number;
  settingsRef: ReturnType<typeof doc>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  pendingLocalSettingsIntentRef: React.MutableRefObject<PendingHostedSettingsWrite | null>;
  inFlightHostedSettingsWriteRef: React.MutableRefObject<InFlightHostedSettingsWrite | null>;
  settingsWriteSequenceRef: React.MutableRefObject<number>;
  pendingDebounceTimerRef: React.MutableRefObject<number | null>;
  supersededBaselineOneShotRef: React.MutableRefObject<UserSettingsDocument | null>;
  writeOwnerUid: string;
  isWriteOwnerActive: () => boolean;
  onPersisted: (settings: UserSettingsDocument, supersededBaseline: UserSettingsDocument) => void;
  onPersistError: (error: unknown) => void;
}

interface DebouncedHostedSettingsWriteExecution {
  capturedWriteSequence: number;
  targetSettings: UserSettingsDocument;
  baseline: UserSettingsDocument;
  settingsRef: ReturnType<typeof doc>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  pendingLocalSettingsIntentRef: React.MutableRefObject<PendingHostedSettingsWrite | null>;
  inFlightHostedSettingsWriteRef: React.MutableRefObject<InFlightHostedSettingsWrite | null>;
  settingsWriteSequenceRef: React.MutableRefObject<number>;
  supersededBaselineOneShotRef: React.MutableRefObject<UserSettingsDocument | null>;
  isWriteOwnerActive: () => boolean;
  onPersisted: (settings: UserSettingsDocument, supersededBaseline: UserSettingsDocument) => void;
  onPersistError: (error: unknown) => void;
}

const markInFlightHostedSettingsWrite = (
  inFlightHostedSettingsWriteRef: React.MutableRefObject<InFlightHostedSettingsWrite | null>,
  capturedWriteSequence: number,
  targetSettings: UserSettingsDocument,
): void => {
  const existingInFlight = inFlightHostedSettingsWriteRef.current;
  if (!existingInFlight || existingInFlight.writeSequence <= capturedWriteSequence) {
    inFlightHostedSettingsWriteRef.current = {
      writeSequence: capturedWriteSequence,
      target: targetSettings,
    };
  }
};

const completeHostedSettingsWriteSuccess = (
  execution: DebouncedHostedSettingsWriteExecution,
): void => {
  const {
    capturedWriteSequence,
    targetSettings,
    baseline,
    lastSyncedSettingsRef,
    pendingLocalSettingsIntentRef,
    settingsWriteSequenceRef,
    supersededBaselineOneShotRef,
    isWriteOwnerActive,
    onPersisted,
  } = execution;
  if (!isWriteOwnerActive()) {
    return;
  }
  if (capturedWriteSequence !== settingsWriteSequenceRef.current) {
    return;
  }
  const currentPending = pendingLocalSettingsIntentRef.current;
  if (!currentPending || currentPending.writeSequence !== capturedWriteSequence) {
    return;
  }
  pendingLocalSettingsIntentRef.current = null;
  lastSyncedSettingsRef.current = targetSettings;
  supersededBaselineOneShotRef.current = baseline;
  onPersisted(targetSettings, baseline);
};

const completeHostedSettingsWriteFailure = (
  execution: DebouncedHostedSettingsWriteExecution,
  error: unknown,
): void => {
  finalizeHostedSettingsWriteFailure({
    pendingLocalSettingsIntentRef: execution.pendingLocalSettingsIntentRef,
    lastSyncedSettingsRef: execution.lastSyncedSettingsRef,
    capturedWriteSequence: execution.capturedWriteSequence,
    isWriteOwnerActive: execution.isWriteOwnerActive,
    onPersistError: execution.onPersistError,
    error,
  });
};

const clearInFlightHostedSettingsWriteIfCurrent = (
  inFlightHostedSettingsWriteRef: React.MutableRefObject<InFlightHostedSettingsWrite | null>,
  capturedWriteSequence: number,
): void => {
  const inFlight = inFlightHostedSettingsWriteRef.current;
  if (inFlight?.writeSequence === capturedWriteSequence) {
    inFlightHostedSettingsWriteRef.current = null;
  }
};

const executeDebouncedHostedSettingsWrite = (
  execution: DebouncedHostedSettingsWriteExecution,
): void => {
  markInFlightHostedSettingsWrite(
    execution.inFlightHostedSettingsWriteRef,
    execution.capturedWriteSequence,
    execution.targetSettings,
  );

  setDoc(
    execution.settingsRef,
    {
      ...execution.targetSettings,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
    .then(() => {
      completeHostedSettingsWriteSuccess(execution);
    })
    .catch((error) => {
      completeHostedSettingsWriteFailure(execution, error);
    })
    .finally(() => {
      clearInFlightHostedSettingsWriteIfCurrent(
        execution.inFlightHostedSettingsWriteRef,
        execution.capturedWriteSequence,
      );
    });
};

/** Debounces hosted settings writes and tracks pending local intent for snapshot coalescing. */
export const scheduleHostedSettingsDocumentWrite = ({
  nextSettings,
  debounceMs,
  settingsRef,
  lastSyncedSettingsRef,
  pendingLocalSettingsIntentRef,
  inFlightHostedSettingsWriteRef,
  settingsWriteSequenceRef,
  pendingDebounceTimerRef,
  supersededBaselineOneShotRef,
  isWriteOwnerActive,
  onPersisted,
  onPersistError,
}: ScheduleHostedSettingsWriteArgs): void => {
  if (pendingDebounceTimerRef.current) {
    window.clearTimeout(pendingDebounceTimerRef.current);
  }

  const inFlightWriteTarget = inFlightHostedSettingsWriteRef.current?.target ?? null;
  const pendingWrite = updatePendingHostedSettingsWriteTarget({
    pendingWriteRef: pendingLocalSettingsIntentRef,
    writeSequenceRef: settingsWriteSequenceRef,
    lastSynced: lastSyncedSettingsRef.current,
    nextTarget: nextSettings,
    inFlightWriteTarget,
  });

  pendingDebounceTimerRef.current = window.setTimeout(() => {
    pendingDebounceTimerRef.current = null;
    const { writeSequence, target: targetSettings, baseline } = pendingWrite;
    executeDebouncedHostedSettingsWrite({
      capturedWriteSequence: writeSequence,
      targetSettings,
      baseline,
      settingsRef,
      lastSyncedSettingsRef,
      pendingLocalSettingsIntentRef,
      inFlightHostedSettingsWriteRef,
      settingsWriteSequenceRef,
      supersededBaselineOneShotRef,
      isWriteOwnerActive,
      onPersisted,
      onPersistError,
    });
  }, debounceMs);
};

export interface ApplyHostedSettingsOptions {
  /** When coalescing, keep Firestore acknowledgement on the raw remote payload. */
  lastSyncedDocument?: UserSettingsDocument;
}

export interface ApplySettingsContext {
  currentDarkModeRef: React.MutableRefObject<boolean>;
  currentOverlaysRef: React.MutableRefObject<OverlaysState>;
  dispatch: ReturnType<typeof useDispatch>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
}

/** Applies a validated settings document into Redux plus local hosted-auth state. */
export const applySettingsToState = (
  settings: UserSettingsDocument,
  context: ApplySettingsContext,
  options?: ApplyHostedSettingsOptions,
) => {
  const {
    currentDarkModeRef,
    currentOverlaysRef,
    dispatch,
    setSyncedSettings,
    lastSyncedSettingsRef,
  } = context;

  const nextLastSynced = options?.lastSyncedDocument ?? settings;

  if (areUserSettingsEqual(lastSyncedSettingsRef.current, settings)) {
    if (
      options?.lastSyncedDocument
      && !areUserSettingsEqual(lastSyncedSettingsRef.current, options.lastSyncedDocument)
    ) {
      lastSyncedSettingsRef.current = options.lastSyncedDocument;
    }
    return;
  }

  if (settings.darkMode !== currentDarkModeRef.current) {
    dispatch(setDarkMode(settings.darkMode));
  }

  if (
    !areOverlaySettingsEqual(currentOverlaysRef.current, {
      baseMapStyle: settings.baseMapStyle,
      stateBorders: settings.stateBorders,
      counties: settings.counties,
      ghostOutlooks: settings.ghostOutlooks,
    })
  ) {
    dispatch(
      applyOverlaySettings({
        baseMapStyle: settings.baseMapStyle,
        stateBorders: settings.stateBorders,
        counties: settings.counties,
        ghostOutlooks: settings.ghostOutlooks,
      }),
    );
  }

  writeStoredForecastUiVariant(settings.forecastUiVariant);
  dispatch(applyMonitorSettings(settings.monitorSettings));
  lastSyncedSettingsRef.current = nextLastSynced;
  setSyncedSettings(settings);
};

/** Normalizes one Firestore settings snapshot before it is applied to Redux. */
export const handleHostedSettingsFirestoreSnapshot = (
  snapshot: {
    data: () => Partial<UserSettingsDocument> | undefined;
    metadata: HostedSettingsSnapshotMetadata;
  },
  opts: {
    isActive: () => boolean;
    getPendingLocalWrite: () => PendingHostedSettingsWrite | null;
    getInFlightHostedSettingsWrite: () => InFlightHostedSettingsWrite | null;
    getSupersededBaselineOneShot: () => UserSettingsDocument | null;
    clearSupersededBaselineOneShot: () => void;
    applyRemoteSettings: (settings: UserSettingsDocument, options?: ApplyHostedSettingsOptions) => void;
    setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  },
): void => {
  if (shouldIgnoreHostedSettingsSnapshot(snapshot.metadata)) {
    return;
  }

  const remoteSettings = readRemoteSettings(snapshot.data());
  if (!opts.isActive() || !remoteSettings) {
    return;
  }

  if (
    consumeSupersededBaselineOneShotIgnore(
      remoteSettings,
      opts.getSupersededBaselineOneShot(),
      opts.clearSupersededBaselineOneShot,
    )
  ) {
    return;
  }

  const pendingWrite = opts.getPendingLocalWrite();
  const inFlightWriteTarget = opts.getInFlightHostedSettingsWrite()?.target ?? null;
  const resolvedSettings = resolveHostedSettingsFromSnapshot(
    remoteSettings,
    pendingWrite,
    inFlightWriteTarget,
  );
  const wasCoalesced = Boolean(
    pendingWrite && !areUserSettingsEqual(resolvedSettings, remoteSettings),
  );
  opts.applyRemoteSettings(
    resolvedSettings,
    wasCoalesced ? { lastSyncedDocument: remoteSettings } : undefined,
  );
  opts.setSettingsSyncStatus('synced');
};

/** Builds the payload used when seeding or repairing a remote settings document. */
export const getRemoteSeedPayload = (
  settings: UserSettingsDocument,
  opts?: { includeCreatedAt?: boolean },
) => ({
  ...settings,
  updatedAt: serverTimestamp(),
  ...(opts?.includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
});

/** Reuses remote settings when available or seeds Firestore from the current local settings snapshot. */
export const seedOrApplySettings = async (opts: {
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
    getRemoteSeedPayload(localSettings, { includeCreatedAt: !settingsSnapshot.exists() }),
    { merge: true },
  );

  if (!isActive()) {
    return;
  }

  lastSyncedSettingsRef.current = localSettings;
  setSyncedSettings(localSettings);
};

/** Starts the live Firestore listener that keeps hosted settings mirrored into local app state. */
export const startSettingsSubscription = (opts: {
  settingsRef: ReturnType<typeof doc>;
  isActive: () => boolean;
  getPendingLocalWrite: () => PendingHostedSettingsWrite | null;
  getInFlightHostedSettingsWrite: () => InFlightHostedSettingsWrite | null;
  getSupersededBaselineOneShot: () => UserSettingsDocument | null;
  clearSupersededBaselineOneShot: () => void;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  applyRemoteSettings: (settings: UserSettingsDocument) => void;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): Unsubscribe =>
  onSnapshot(
    opts.settingsRef,
    (snapshot) => {
      handleHostedSettingsFirestoreSnapshot(
        {
          data: () => snapshot.data() as Partial<UserSettingsDocument> | undefined,
          metadata: { hasPendingWrites: snapshot.metadata.hasPendingWrites },
        },
        {
          isActive: opts.isActive,
          getPendingLocalWrite: opts.getPendingLocalWrite,
          getInFlightHostedSettingsWrite: opts.getInFlightHostedSettingsWrite,
          getSupersededBaselineOneShot: opts.getSupersededBaselineOneShot,
          clearSupersededBaselineOneShot: opts.clearSupersededBaselineOneShot,
          applyRemoteSettings: opts.applyRemoteSettings,
          setSettingsSyncStatus: opts.setSettingsSyncStatus,
        },
      );
    },
    (snapshotError) => {
      if (opts.isActive()) {
        opts.setSettingsSyncStatus('error');
        opts.setError(snapshotError.message);
      }
    },
  );

const buildHostedProfilePayload = (
  user: User,
  opts?: { includeCreatedAt?: boolean },
) => ({
  email: user.email ?? '',
  displayName: user.displayName ?? '',
  photoURL: user.photoURL ?? '',
  providers: (user.providerData ?? []).map((provider) => provider.providerId),
  updatedAt: serverTimestamp(),
  ...(opts?.includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
});

/** Creates or updates the hosted profile document while preserving the original creation timestamp. */
export const syncProfileDocument = async (
  profileRef: ReturnType<typeof doc>,
  user: User,
  createPayload: (
    profileUser: User,
    payloadOpts?: { includeCreatedAt?: boolean },
  ) => Record<string, unknown> = buildHostedProfilePayload,
): Promise<void> => {
  const profileSnapshot = await getDoc(profileRef);
  const needsCreatedAt =
    !profileSnapshot.exists() || profileSnapshot.data()?.createdAt === undefined;
  await setDoc(
    profileRef,
    {
      ...createPayload(user, { includeCreatedAt: needsCreatedAt }),
    },
    { merge: true },
  );
};

/** Runs the initial hosted profile/settings sync before the live subscription takes over. */
export const runInitialHostedSync = async (opts: {
  profileRef: ReturnType<typeof doc>;
  settingsRef: ReturnType<typeof doc>;
  user: User;
  buildLocalSettingsSnapshot: () => UserSettingsDocument;
  applyRemoteSettings: (settings: UserSettingsDocument) => void;
  isActive: () => boolean;
  getPendingLocalWrite: () => PendingHostedSettingsWrite | null;
  getInFlightHostedSettingsWrite: () => InFlightHostedSettingsWrite | null;
  getSupersededBaselineOneShot: () => UserSettingsDocument | null;
  clearSupersededBaselineOneShot: () => void;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  hasInitializedSettingsRef: React.MutableRefObject<boolean>;
}): Promise<Unsubscribe | undefined> => {
  opts.setSettingsSyncStatus('syncing');

  try {
    await syncProfileDocument(opts.profileRef, opts.user);

    const settingsSnapshot = await getDoc(opts.settingsRef);
    const localSettings = opts.buildLocalSettingsSnapshot();
    await seedOrApplySettings({
      settingsRef: opts.settingsRef,
      settingsSnapshot,
      localSettings,
      applyRemoteSettings: opts.applyRemoteSettings,
      isActive: opts.isActive,
      lastSyncedSettingsRef: opts.lastSyncedSettingsRef,
      setSyncedSettings: opts.setSyncedSettings,
    });

    if (!opts.isActive()) {
      return undefined;
    }

    opts.hasInitializedSettingsRef.current = true;
    opts.setSettingsSyncStatus('synced');

    return startSettingsSubscription({
      settingsRef: opts.settingsRef,
      isActive: opts.isActive,
      getPendingLocalWrite: opts.getPendingLocalWrite,
      getInFlightHostedSettingsWrite: opts.getInFlightHostedSettingsWrite,
      getSupersededBaselineOneShot: opts.getSupersededBaselineOneShot,
      clearSupersededBaselineOneShot: opts.clearSupersededBaselineOneShot,
      lastSyncedSettingsRef: opts.lastSyncedSettingsRef,
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
  if (nextUnsubscribe) {
    setSubscription(nextUnsubscribe);
  }
});

export { areUserSettingsEqual, readRemoteSettings, type UserSettingsDocument };
