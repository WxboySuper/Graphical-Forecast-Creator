import { setDoc } from 'firebase/firestore';
import {
  applySettingsToState,
  areUserSettingsEqual,
  cancelPendingHostedSettingsWriteIntent,
  coalesceRemoteSettingsWithPendingLocal,
  consumeSupersededBaselineOneShotIgnore,
  finalizeHostedSettingsWriteFailure,
  handleHostedSettingsFirestoreSnapshot,
  scheduleHostedSettingsDocumentWrite,
  shouldIgnoreHostedSettingsSnapshot,
  shouldSkipHostedSettingsDocumentWrite,
  type InFlightHostedSettingsWrite,
  type PendingHostedSettingsWrite,
} from './hostedSettingsSync';
import { createSettingsSnapshot } from './AuthProvider';
import { applyOverlaySettings } from '../store/overlaysSlice';
import { setDarkMode } from '../store/themeSlice';
import type { OverlaysState } from '../store/overlaysSlice';

jest.mock('../lib/firebase', () => ({
  auth: null,
  db: null,
  googleAuthProvider: {},
  isHostedAuthEnabled: false,
  requireAuth: jest.fn(),
  requireDb: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...path) => ({ path })),
  getDoc: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
  setDoc: jest.fn(),
}));

const TEST_OVERLAY_STATE: OverlaysState = {
  baseMapStyle: 'osm',
  stateBorders: true,
  counties: false,
  ghostOutlooks: {
    tornado: false,
    wind: false,
    hail: false,
    categorical: false,
    totalSevere: false,
    'day4-8': false,
  },
  outlookTrimStrategy: 'us-country-minus-great-lakes',
  outlookTrimAutoOnDraw: false,
  outlookTrimPreviewOnly: false,
};

describe('hosted settings sync', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const buildHostedSettingsFixture = (baseMapStyle: OverlaysState['baseMapStyle']) =>
    createSettingsSnapshot({
      darkMode: false,
      overlays: { ...TEST_OVERLAY_STATE, baseMapStyle },
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock',
    });

  const createSnapshotHarness = (localOverlays: OverlaysState, lastSyncedSettingsRef: { current: ReturnType<typeof buildHostedSettingsFixture> | null }) => {
    const dispatch = jest.fn();
    return {
      dispatch,
      applySnapshot: (
        remote: ReturnType<typeof buildHostedSettingsFixture>,
        opts?: {
          pending?: PendingHostedSettingsWrite | null;
          inFlight?: InFlightHostedSettingsWrite | null;
          oneShot?: PendingHostedSettingsWrite['baseline'] | null;
        },
      ) => {
        const oneShotRef = { current: opts?.oneShot ?? null };
        handleHostedSettingsFirestoreSnapshot(
          { data: () => remote, metadata: { hasPendingWrites: false } },
          {
            isActive: () => true,
            getPendingLocalWrite: () => opts?.pending ?? null,
            getInFlightHostedSettingsWrite: () => opts?.inFlight ?? null,
            getSupersededBaselineOneShot: () => oneShotRef.current,
            clearSupersededBaselineOneShot: () => {
              oneShotRef.current = null;
            },
            applyRemoteSettings: (settings, options) => {
              applySettingsToState(settings, {
                currentDarkModeRef: { current: false },
                currentOverlaysRef: { current: localOverlays },
                dispatch,
                setSyncedSettings: jest.fn(),
                lastSyncedSettingsRef,
              }, options);
            },
            setSettingsSyncStatus: jest.fn(),
          },
        );
      },
    };
  };

  test.each([
    {
      name: 'keeps pending basemap when remote is stale',
      remoteStyle: 'osm' as const,
      expectStyle: 'carto-light' as const,
      remotePatch: {},
      extraExpect: null as ((coalesced: ReturnType<typeof buildHostedSettingsFixture>) => void) | null,
    },
    {
      name: 'still applies another device field while basemap write is pending',
      remoteStyle: 'osm' as const,
      expectStyle: 'carto-light' as const,
      remotePatch: { counties: true },
      extraExpect: (coalesced: ReturnType<typeof buildHostedSettingsFixture>) => {
        expect(coalesced.counties).toBe(true);
      },
    },
  ])('coalesceRemoteSettingsWithPendingLocal $name', ({ remoteStyle, expectStyle, remotePatch, extraExpect }) => {
    const baseline = buildHostedSettingsFixture('osm');
    const target = buildHostedSettingsFixture('carto-light');
    const remote = { ...buildHostedSettingsFixture(remoteStyle), ...remotePatch };
    const coalesced = coalesceRemoteSettingsWithPendingLocal(remote, {
      baseline,
      target,
      writeSequence: 1,
    });
    expect(coalesced.baseMapStyle).toBe(expectStyle);
    extraExpect?.(coalesced);
  });

  test('consumeSupersededBaselineOneShotIgnore ignores only the first matching stale echo', () => {
    const baseline = buildHostedSettingsFixture('osm');
    const acknowledged = buildHostedSettingsFixture('carto-light');
    let oneShot: PendingHostedSettingsWrite['baseline'] | null = baseline;
    const clearOneShot = () => {
      oneShot = null;
    };

    expect(consumeSupersededBaselineOneShotIgnore(baseline, oneShot, clearOneShot)).toBe(true);
    expect(oneShot).toBeNull();
    expect(consumeSupersededBaselineOneShotIgnore(baseline, oneShot, clearOneShot)).toBe(false);
    expect(consumeSupersededBaselineOneShotIgnore(acknowledged, baseline, () => undefined)).toBe(false);
  });

  test('after one-shot stale echo is consumed, another device can revert basemap to the old value', () => {
    const baseline = buildHostedSettingsFixture('osm');
    const acknowledged = buildHostedSettingsFixture('carto-light');
    const oneShotRef = { current: baseline as PendingHostedSettingsWrite['baseline'] | null };
    const dispatch = jest.fn();
    const lastSyncedSettingsRef = { current: acknowledged };
    const localOverlays = { ...TEST_OVERLAY_STATE, baseMapStyle: 'carto-light' as const };

    handleHostedSettingsFirestoreSnapshot(
      { data: () => baseline, metadata: { hasPendingWrites: false } },
      {
        isActive: () => true,
        getPendingLocalWrite: () => null,
        getInFlightHostedSettingsWrite: () => null,
        getSupersededBaselineOneShot: () => oneShotRef.current,
        clearSupersededBaselineOneShot: () => {
          oneShotRef.current = null;
        },
        applyRemoteSettings: (settings) => {
          applySettingsToState(settings, {
            currentDarkModeRef: { current: false },
            currentOverlaysRef: { current: localOverlays },
            dispatch,
            setSyncedSettings: jest.fn(),
            lastSyncedSettingsRef,
          });
        },
        setSettingsSyncStatus: jest.fn(),
      },
    );
    expect(dispatch).not.toHaveBeenCalled();

    handleHostedSettingsFirestoreSnapshot(
      { data: () => baseline, metadata: { hasPendingWrites: false } },
      {
        isActive: () => true,
        getPendingLocalWrite: () => null,
        getInFlightHostedSettingsWrite: () => null,
        getSupersededBaselineOneShot: () => oneShotRef.current,
        clearSupersededBaselineOneShot: () => {
          oneShotRef.current = null;
        },
        applyRemoteSettings: (settings) => {
          applySettingsToState(settings, {
            currentDarkModeRef: { current: false },
            currentOverlaysRef: { current: localOverlays },
            dispatch,
            setSyncedSettings: jest.fn(),
            lastSyncedSettingsRef,
          });
        },
        setSettingsSyncStatus: jest.fn(),
      },
    );

    expect(dispatch).toHaveBeenCalledWith(
      applyOverlaySettings(expect.objectContaining({ baseMapStyle: 'osm' })),
    );
  });

  test('coalesceRemoteSettingsWithPendingLocal ignores superseded in-flight write targets', () => {
    const baseline = buildHostedSettingsFixture('osm');
    const inFlightB = buildHostedSettingsFixture('carto-light');
    const targetC = buildHostedSettingsFixture('esri-satellite');
    const coalesced = coalesceRemoteSettingsWithPendingLocal(
      inFlightB,
      {
        baseline,
        target: targetC,
        writeSequence: 2,
      },
      inFlightB,
    );
    expect(coalesced.baseMapStyle).toBe('esri-satellite');
  });

  test('regression: raw stale remote without coalesce reverts pending basemap', () => {
    const staleRemote = buildHostedSettingsFixture('osm');
    const acknowledged = buildHostedSettingsFixture('carto-light');
    const localOverlays = { ...TEST_OVERLAY_STATE, baseMapStyle: 'carto-light' as const };
    const dispatch = jest.fn();

    applySettingsToState(staleRemote, {
      currentDarkModeRef: { current: false },
      currentOverlaysRef: { current: localOverlays },
      dispatch,
      setSyncedSettings: jest.fn(),
      lastSyncedSettingsRef: { current: acknowledged },
    });

    expect(dispatch).toHaveBeenCalledWith(
      applyOverlaySettings(expect.objectContaining({ baseMapStyle: 'osm' })),
    );
  });

  test('handleHostedSettingsFirestoreSnapshot keeps pending basemap when stale remote arrives', () => {
    const baseline = buildHostedSettingsFixture('osm');
    const target = buildHostedSettingsFixture('carto-light');
    const localOverlays = { ...TEST_OVERLAY_STATE, baseMapStyle: 'carto-light' as const };
    const lastSyncedSettingsRef = { current: baseline };
    const { dispatch, applySnapshot } = createSnapshotHarness(localOverlays, lastSyncedSettingsRef);

    applySnapshot(baseline, {
      pending: {
        baseline,
        target,
        writeSequence: 1,
      },
    });

    expect(dispatch).not.toHaveBeenCalledWith(
      applyOverlaySettings(expect.objectContaining({ baseMapStyle: 'osm' })),
    );
  });

  test('handleHostedSettingsFirestoreSnapshot applies another device change when nothing is pending', () => {
    const baseline = buildHostedSettingsFixture('osm');
    const remoteUpdate = { ...baseline, counties: true };
    const dispatch = jest.fn();
    const lastSyncedSettingsRef = { current: baseline };

    handleHostedSettingsFirestoreSnapshot(
      { data: () => remoteUpdate, metadata: { hasPendingWrites: false } },
      {
        isActive: () => true,
        getPendingLocalWrite: () => null,
        getInFlightHostedSettingsWrite: () => null,
        getSupersededBaselineOneShot: () => null,
        clearSupersededBaselineOneShot: jest.fn(),
        applyRemoteSettings: (settings) => {
          applySettingsToState(settings, {
            currentDarkModeRef: { current: false },
            currentOverlaysRef: { current: TEST_OVERLAY_STATE },
            dispatch,
            setSyncedSettings: jest.fn(),
            lastSyncedSettingsRef,
          });
        },
        setSettingsSyncStatus: jest.fn(),
      },
    );

    expect(dispatch).toHaveBeenCalledWith(
      applyOverlaySettings(expect.objectContaining({ counties: true })),
    );
  });

  test('shouldIgnoreHostedSettingsSnapshot skips Firestore local-write echoes', () => {
    expect(shouldIgnoreHostedSettingsSnapshot({ hasPendingWrites: true })).toBe(true);
    expect(shouldIgnoreHostedSettingsSnapshot({ hasPendingWrites: false })).toBe(false);
  });

  test('debounced hosted write survives stale snapshot after setDoc starts', async () => {
    jest.useFakeTimers();
    try {
      let resolveWrite: (() => void) | undefined;
      const setDocSpy = jest.mocked(setDoc).mockImplementation(
        () => new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }) as never,
      );
      const baseline = buildHostedSettingsFixture('osm');
      const target = buildHostedSettingsFixture('carto-light');
      const localOverlays = { ...TEST_OVERLAY_STATE, baseMapStyle: 'carto-light' as const };
      const lastSyncedSettingsRef = { current: baseline };
      const pendingIntentRef = { current: null as PendingHostedSettingsWrite | null };
      const inFlightRef = { current: null as InFlightHostedSettingsWrite | null };
      const writeSequenceRef = { current: 0 };
      const debounceRef = { current: null as number | null };
      const supersededBaselineRef = { current: null as PendingHostedSettingsWrite['baseline'] | null };
      const dispatch = jest.fn();
      const active = true;

      scheduleHostedSettingsDocumentWrite({
        nextSettings: target,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededBaselineRef,
        writeOwnerUid: 'user-1',
        isWriteOwnerActive: () => active,
        onPersisted: (settings) => {
          lastSyncedSettingsRef.current = settings;
        },
        onPersistError: () => undefined,
      });

      jest.advanceTimersByTime(750);
      expect(setDocSpy).toHaveBeenCalled();
      expect(pendingIntentRef.current).not.toBeNull();

      handleHostedSettingsFirestoreSnapshot(
        { data: () => baseline, metadata: { hasPendingWrites: false } },
        {
          isActive: () => active,
          getPendingLocalWrite: () => pendingIntentRef.current,
          getInFlightHostedSettingsWrite: () => inFlightRef.current,
          getSupersededBaselineOneShot: () => supersededBaselineRef.current,
          clearSupersededBaselineOneShot: () => {
            supersededBaselineRef.current = null;
          },
          applyRemoteSettings: (settings) => {
            applySettingsToState(settings, {
              currentDarkModeRef: { current: false },
              currentOverlaysRef: { current: localOverlays },
              dispatch,
              setSyncedSettings: jest.fn(),
              lastSyncedSettingsRef,
            });
          },
          setSettingsSyncStatus: jest.fn(),
        },
      );

      expect(dispatch).not.toHaveBeenCalledWith(
        applyOverlaySettings(expect.objectContaining({ baseMapStyle: 'osm' })),
      );

      resolveWrite?.();
      await Promise.resolve();
      expect(pendingIntentRef.current).toBeNull();
      expect(lastSyncedSettingsRef.current?.baseMapStyle).toBe('carto-light');
      expect(supersededBaselineRef.current?.baseMapStyle).toBe('osm');

      handleHostedSettingsFirestoreSnapshot(
        { data: () => baseline, metadata: { hasPendingWrites: false } },
        {
          isActive: () => active,
          getPendingLocalWrite: () => pendingIntentRef.current,
          getInFlightHostedSettingsWrite: () => inFlightRef.current,
          getSupersededBaselineOneShot: () => supersededBaselineRef.current,
          clearSupersededBaselineOneShot: () => {
            supersededBaselineRef.current = null;
          },
          applyRemoteSettings: (settings) => {
            applySettingsToState(settings, {
              currentDarkModeRef: { current: false },
              currentOverlaysRef: { current: localOverlays },
              dispatch,
              setSyncedSettings: jest.fn(),
              lastSyncedSettingsRef,
            });
          },
          setSettingsSyncStatus: jest.fn(),
        },
      );

      expect(dispatch).not.toHaveBeenCalledWith(
        applyOverlaySettings(expect.objectContaining({ baseMapStyle: 'osm' })),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('in-flight B confirmation snapshot does not revert newer local C selection', async () => {
    jest.useFakeTimers();
    try {
      let resolveB: (() => void) | undefined;
      const setDocSpy = jest.mocked(setDoc).mockImplementation(
        () => new Promise<void>((resolve) => {
          resolveB = resolve;
        }) as never,
      );
      const baseline = buildHostedSettingsFixture('osm');
      const targetB = buildHostedSettingsFixture('carto-light');
      const targetC = buildHostedSettingsFixture('esri-satellite');
      const localOverlaysC = { ...TEST_OVERLAY_STATE, baseMapStyle: 'esri-satellite' as const };
      const lastSyncedSettingsRef = { current: baseline };
      const pendingIntentRef = { current: null as PendingHostedSettingsWrite | null };
      const inFlightRef = { current: null as InFlightHostedSettingsWrite | null };
      const writeSequenceRef = { current: 0 };
      const debounceRef = { current: null as number | null };
      const supersededOneShotRef = { current: null as PendingHostedSettingsWrite['baseline'] | null };
      const dispatch = jest.fn();

      scheduleHostedSettingsDocumentWrite({
        nextSettings: targetB,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededOneShotRef,
        writeOwnerUid: 'user-1',
        isWriteOwnerActive: () => true,
        onPersisted: () => undefined,
        onPersistError: () => undefined,
      });
      jest.advanceTimersByTime(750);
      expect(inFlightRef.current?.target.baseMapStyle).toBe('carto-light');

      scheduleHostedSettingsDocumentWrite({
        nextSettings: targetC,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededOneShotRef,
        writeOwnerUid: 'user-1',
        isWriteOwnerActive: () => true,
        onPersisted: () => undefined,
        onPersistError: () => undefined,
      });
      expect(pendingIntentRef.current?.baseline.baseMapStyle).toBe('carto-light');
      expect(pendingIntentRef.current?.target.baseMapStyle).toBe('esri-satellite');

      handleHostedSettingsFirestoreSnapshot(
        { data: () => targetB, metadata: { hasPendingWrites: false } },
        {
          isActive: () => true,
          getPendingLocalWrite: () => pendingIntentRef.current,
          getInFlightHostedSettingsWrite: () => inFlightRef.current,
          getSupersededBaselineOneShot: () => null,
          clearSupersededBaselineOneShot: jest.fn(),
          applyRemoteSettings: (settings) => {
            applySettingsToState(settings, {
              currentDarkModeRef: { current: false },
              currentOverlaysRef: { current: localOverlaysC },
              dispatch,
              setSyncedSettings: jest.fn(),
              lastSyncedSettingsRef,
            });
          },
          setSettingsSyncStatus: jest.fn(),
        },
      );

      expect(dispatch).not.toHaveBeenCalledWith(
        applyOverlaySettings(expect.objectContaining({ baseMapStyle: 'carto-light' })),
      );

      resolveB?.();
      await Promise.resolve();

      jest.advanceTimersByTime(750);
      await Promise.resolve();
      expect(setDocSpy).toHaveBeenLastCalledWith(
        { path: 'settings' },
        expect.objectContaining({ baseMapStyle: 'esri-satellite' }),
        { merge: true },
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('in-flight B confirmation does not apply when user reverts to A before B resolves', async () => {
    jest.useFakeTimers();
    try {
      let resolveB: (() => void) | undefined;
      const setDocSpy = jest.mocked(setDoc).mockImplementation(
        () => new Promise<void>((resolve) => {
          resolveB = resolve;
        }) as never,
      );
      const baseline = buildHostedSettingsFixture('osm');
      const targetB = buildHostedSettingsFixture('carto-light');
      const localOverlaysA = { ...TEST_OVERLAY_STATE, baseMapStyle: 'osm' as const };
      const lastSyncedSettingsRef = { current: baseline };
      const pendingIntentRef = { current: null as PendingHostedSettingsWrite | null };
      const inFlightRef = { current: null as InFlightHostedSettingsWrite | null };
      const writeSequenceRef = { current: 0 };
      const debounceRef = { current: null as number | null };
      const supersededOneShotRef = { current: null as PendingHostedSettingsWrite['baseline'] | null };
      const dispatch = jest.fn();

      scheduleHostedSettingsDocumentWrite({
        nextSettings: targetB,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededOneShotRef,
        writeOwnerUid: 'user-1',
        isWriteOwnerActive: () => true,
        onPersisted: () => undefined,
        onPersistError: () => undefined,
      });
      jest.advanceTimersByTime(750);
      expect(inFlightRef.current?.target.baseMapStyle).toBe('carto-light');

      expect(
        shouldSkipHostedSettingsDocumentWrite(baseline, baseline, inFlightRef.current),
      ).toBe(false);

      scheduleHostedSettingsDocumentWrite({
        nextSettings: baseline,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededOneShotRef,
        writeOwnerUid: 'user-1',
        isWriteOwnerActive: () => true,
        onPersisted: () => undefined,
        onPersistError: () => undefined,
      });
      expect(pendingIntentRef.current?.target.baseMapStyle).toBe('osm');
      expect(pendingIntentRef.current?.baseline.baseMapStyle).toBe('carto-light');

      resolveB?.();
      await Promise.resolve();

      handleHostedSettingsFirestoreSnapshot(
        { data: () => targetB, metadata: { hasPendingWrites: false } },
        {
          isActive: () => true,
          getPendingLocalWrite: () => pendingIntentRef.current,
          getInFlightHostedSettingsWrite: () => inFlightRef.current,
          getSupersededBaselineOneShot: () => null,
          clearSupersededBaselineOneShot: jest.fn(),
          applyRemoteSettings: (settings, options) => {
            applySettingsToState(settings, {
              currentDarkModeRef: { current: false },
              currentOverlaysRef: { current: localOverlaysA },
              dispatch,
              setSyncedSettings: jest.fn(),
              lastSyncedSettingsRef,
            }, options);
          },
          setSettingsSyncStatus: jest.fn(),
        },
      );

      expect(dispatch).not.toHaveBeenCalledWith(
        applyOverlaySettings(expect.objectContaining({ baseMapStyle: 'carto-light' })),
      );

      jest.advanceTimersByTime(750);
      await Promise.resolve();
      expect(setDocSpy).toHaveBeenLastCalledWith(
        { path: 'settings' },
        expect.objectContaining({ baseMapStyle: 'osm' }),
        { merge: true },
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('failed in-flight B write keeps pending C and still persists C', async () => {
    jest.useFakeTimers();
    try {
      let rejectB: ((error: Error) => void) | undefined;
      let setDocCallCount = 0;
      const setDocSpy = jest.mocked(setDoc).mockImplementation(() => {
        setDocCallCount += 1;
        if (setDocCallCount === 1) {
          return new Promise<void>((_, reject) => {
            rejectB = reject;
          }) as never;
        }
        return Promise.resolve() as never;
      });
      const baseline = buildHostedSettingsFixture('osm');
      const targetB = buildHostedSettingsFixture('carto-light');
      const targetC = buildHostedSettingsFixture('esri-satellite');
      const lastSyncedSettingsRef = { current: baseline };
      const pendingIntentRef = { current: null as PendingHostedSettingsWrite | null };
      const inFlightRef = { current: null as InFlightHostedSettingsWrite | null };
      const writeSequenceRef = { current: 0 };
      const debounceRef = { current: null as number | null };
      const supersededOneShotRef = { current: null as PendingHostedSettingsWrite['baseline'] | null };
      const onPersistError = jest.fn();

      scheduleHostedSettingsDocumentWrite({
        nextSettings: targetB,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededOneShotRef,
        writeOwnerUid: 'user-1',
        isWriteOwnerActive: () => true,
        onPersisted: () => undefined,
        onPersistError,
      });
      jest.advanceTimersByTime(750);

      scheduleHostedSettingsDocumentWrite({
        nextSettings: targetC,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededOneShotRef,
        writeOwnerUid: 'user-1',
        isWriteOwnerActive: () => true,
        onPersisted: () => undefined,
        onPersistError,
      });
      expect(pendingIntentRef.current?.target.baseMapStyle).toBe('esri-satellite');

      rejectB?.(new Error('write failed'));
      await Promise.resolve();
      await Promise.resolve();

      expect(onPersistError).toHaveBeenCalledTimes(1);
      expect(pendingIntentRef.current?.writeSequence).toBe(2);
      expect(pendingIntentRef.current?.target.baseMapStyle).toBe('esri-satellite');
      expect(pendingIntentRef.current?.baseline.baseMapStyle).toBe('osm');

      jest.advanceTimersByTime(750);
      await Promise.resolve();
      expect(setDocSpy).toHaveBeenLastCalledWith(
        { path: 'settings' },
        expect.objectContaining({ baseMapStyle: 'esri-satellite' }),
        { merge: true },
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('failed in-flight B still allows C write when sync status is already error', async () => {
    jest.useFakeTimers();
    try {
      let rejectB: ((error: Error) => void) | undefined;
      let setDocCallCount = 0;
      const setDocSpy = jest.mocked(setDoc).mockImplementation(() => {
        setDocCallCount += 1;
        if (setDocCallCount === 1) {
          return new Promise<void>((_, reject) => {
            rejectB = reject;
          }) as never;
        }
        return Promise.resolve() as never;
      });
      const baseline = buildHostedSettingsFixture('osm');
      const targetB = buildHostedSettingsFixture('carto-light');
      const targetC = buildHostedSettingsFixture('esri-satellite');
      const lastSyncedSettingsRef = { current: baseline };
      const pendingIntentRef = { current: null as PendingHostedSettingsWrite | null };
      const inFlightRef = { current: null as InFlightHostedSettingsWrite | null };
      const writeSequenceRef = { current: 0 };
      const debounceRef = { current: null as number | null };
      const supersededOneShotRef = { current: null as PendingHostedSettingsWrite['baseline'] | null };
      let settingsSyncStatus: 'error' | 'synced' = 'error';
      const onPersistError = jest.fn(() => {
        settingsSyncStatus = 'error';
      });

      scheduleHostedSettingsDocumentWrite({
        nextSettings: targetB,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededOneShotRef,
        writeOwnerUid: 'user-1',
        isWriteOwnerActive: () => true,
        onPersisted: () => undefined,
        onPersistError,
      });
      jest.advanceTimersByTime(750);

      expect(
        shouldSkipHostedSettingsDocumentWrite(targetC, baseline, inFlightRef.current),
      ).toBe(false);

      scheduleHostedSettingsDocumentWrite({
        nextSettings: targetC,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededOneShotRef,
        writeOwnerUid: 'user-1',
        isWriteOwnerActive: () => true,
        onPersisted: () => undefined,
        onPersistError,
      });

      rejectB?.(new Error('write failed'));
      await Promise.resolve();
      await Promise.resolve();
      expect(settingsSyncStatus).toBe('error');
      expect(pendingIntentRef.current?.target.baseMapStyle).toBe('esri-satellite');

      jest.advanceTimersByTime(750);
      await Promise.resolve();
      expect(setDocSpy).toHaveBeenLastCalledWith(
        { path: 'settings' },
        expect.objectContaining({ baseMapStyle: 'esri-satellite' }),
        { merge: true },
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('finalizeHostedSettingsWriteFailure rebases newer pending intent after failed write', () => {
    const baseline = buildHostedSettingsFixture('osm');
    const targetB = buildHostedSettingsFixture('carto-light');
    const targetC = buildHostedSettingsFixture('esri-satellite');
    const lastSyncedSettingsRef = { current: baseline };
    const pendingRef = {
      current: {
        baseline: targetB,
        target: targetC,
        writeSequence: 2,
      } satisfies PendingHostedSettingsWrite,
    };
    const onPersistError = jest.fn();

    finalizeHostedSettingsWriteFailure({
      pendingLocalSettingsIntentRef: pendingRef,
      lastSyncedSettingsRef,
      capturedWriteSequence: 1,
      isWriteOwnerActive: () => true,
      onPersistError,
      error: new Error('failed'),
    });

    expect(pendingRef.current?.target.baseMapStyle).toBe('esri-satellite');
    expect(pendingRef.current?.baseline.baseMapStyle).toBe('osm');
    expect(onPersistError).toHaveBeenCalledTimes(1);
  });

  test('coalesced remote dark mode keeps lastSynced on raw remote during basemap debounce', () => {
    const baseline = buildHostedSettingsFixture('osm');
    const targetB = buildHostedSettingsFixture('carto-light');
    const remoteDarkMode = { ...baseline, darkMode: true };
    const dispatch = jest.fn();
    const lastSyncedSettingsRef = { current: baseline };
    const localOverlays = { ...TEST_OVERLAY_STATE, baseMapStyle: 'carto-light' as const };
    const pendingIntentRef = {
      current: {
        baseline,
        target: targetB,
        writeSequence: 1,
      },
    };

    handleHostedSettingsFirestoreSnapshot(
      { data: () => remoteDarkMode, metadata: { hasPendingWrites: false } },
      {
        isActive: () => true,
        getPendingLocalWrite: () => pendingIntentRef.current,
        getInFlightHostedSettingsWrite: () => null,
        getSupersededBaselineOneShot: () => null,
        clearSupersededBaselineOneShot: jest.fn(),
        applyRemoteSettings: (settings, options) => {
          applySettingsToState(settings, {
            currentDarkModeRef: { current: false },
            currentOverlaysRef: { current: localOverlays },
            dispatch,
            setSyncedSettings: jest.fn(),
            lastSyncedSettingsRef,
          }, options);
        },
        setSettingsSyncStatus: jest.fn(),
      },
    );

    expect(dispatch).toHaveBeenCalledWith(setDarkMode(true));
    expect(lastSyncedSettingsRef.current?.darkMode).toBe(true);
    expect(lastSyncedSettingsRef.current?.baseMapStyle).toBe('osm');
    expect(areUserSettingsEqual(lastSyncedSettingsRef.current, targetB)).toBe(false);
  });

  test('debounce cancel when local matches synced clears pending intent (A to B to A)', () => {
    const baseline = buildHostedSettingsFixture('osm');
    const targetB = buildHostedSettingsFixture('carto-light');
    const pendingRef = {
      current: {
        baseline,
        target: targetB,
        writeSequence: 1,
      } satisfies PendingHostedSettingsWrite,
    };
    const debounceRef = { current: 99 as number };

    cancelPendingHostedSettingsWriteIntent(debounceRef, pendingRef);
    expect(pendingRef.current).toBeNull();
    expect(debounceRef.current).toBeNull();
  });

  test('after pending intent is cleared, remote dark mode changes do not coalesce basemap', () => {
    const baseline = buildHostedSettingsFixture('osm');
    const remoteDarkMode = { ...baseline, darkMode: true };
    const dispatch = jest.fn();
    const lastSyncedSettingsRef = { current: baseline };

    handleHostedSettingsFirestoreSnapshot(
      { data: () => remoteDarkMode, metadata: { hasPendingWrites: false } },
      {
        isActive: () => true,
        getPendingLocalWrite: () => null,
        getInFlightHostedSettingsWrite: () => null,
        getSupersededBaselineOneShot: () => null,
        clearSupersededBaselineOneShot: jest.fn(),
        applyRemoteSettings: (settings) => {
          applySettingsToState(settings, {
            currentDarkModeRef: { current: false },
            currentOverlaysRef: { current: TEST_OVERLAY_STATE },
            dispatch,
            setSyncedSettings: jest.fn(),
            lastSyncedSettingsRef,
          });
        },
        setSettingsSyncStatus: jest.fn(),
      },
    );

    expect(dispatch).toHaveBeenCalledWith(setDarkMode(true));
    expect(dispatch).not.toHaveBeenCalledWith(
      applyOverlaySettings(expect.objectContaining({ baseMapStyle: 'carto-light' })),
    );
  });

  test('setDoc completion after sign-out does not mutate hosted sync refs', async () => {
    jest.useFakeTimers();
    try {
      let resolveWrite: (() => void) | undefined;
      jest.mocked(setDoc).mockImplementation(
        () => new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }) as never,
      );
      const baseline = buildHostedSettingsFixture('osm');
      const target = buildHostedSettingsFixture('carto-light');
      const lastSyncedSettingsRef = { current: baseline };
      const pendingIntentRef = { current: null as PendingHostedSettingsWrite | null };
      const inFlightRef = { current: null as InFlightHostedSettingsWrite | null };
      const writeSequenceRef = { current: 0 };
      const debounceRef = { current: null as number | null };
      const supersededOneShotRef = { current: null as PendingHostedSettingsWrite['baseline'] | null };
      const onPersisted = jest.fn();
      let writeOwnerActive = true;
      const writeOwnerUid = 'user-a';
      let currentUid = 'user-a';

      scheduleHostedSettingsDocumentWrite({
        nextSettings: target,
        debounceMs: 750,
        settingsRef: { path: 'settings' } as never,
        lastSyncedSettingsRef,
        pendingLocalSettingsIntentRef: pendingIntentRef,
        inFlightHostedSettingsWriteRef: inFlightRef,
        settingsWriteSequenceRef: writeSequenceRef,
        pendingDebounceTimerRef: debounceRef,
        supersededBaselineOneShotRef: supersededOneShotRef,
        writeOwnerUid,
        isWriteOwnerActive: () => writeOwnerActive && currentUid === writeOwnerUid,
        onPersisted,
        onPersistError: () => undefined,
      });

      jest.advanceTimersByTime(750);
      writeOwnerActive = false;
      currentUid = 'user-b';
      resolveWrite?.();
      await Promise.resolve();

      expect(lastSyncedSettingsRef.current).toEqual(baseline);
      expect(supersededOneShotRef.current).toBeNull();
      expect(onPersisted).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
