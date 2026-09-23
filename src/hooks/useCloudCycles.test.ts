import { act, renderHook } from '@testing-library/react';
import {
  buildLoadedCloudForecastPayload,
  canApplyCloudSaveResult,
  canApplyCloudSaveSelection,
  enqueueCloudSave,
  useCloudCycles,
} from './useCloudCycles';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import {
  loadCloudCycle,
  saveCloudCycle,
  subscribeToCloudCycles,
} from '../lib/cloudCyclesService';
import { readLocalTestAccount } from '../lib/localTestAccount';
import type { CloudCycle } from '../types/cloudCycles';
import type { GFCForecastSaveData } from '../types/outlooks';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: jest.fn(),
}));

jest.mock('../lib/cloudCyclesService', () => ({
  saveCloudCycle: jest.fn(),
  loadCloudCycle: jest.fn(),
  deleteCloudCycle: jest.fn(),
  renameCloudCycle: jest.fn(),
  listCloudCycles: jest.fn(),
  subscribeToCloudCycles: jest.fn(),
}));

jest.mock('../lib/localTestAccount', () => ({
  readLocalTestAccount: jest.fn(),
}));

jest.mock('../utils/productMetrics', () => ({
  queueProductMetric: jest.fn(),
}));

jest.mock('../lib/productAnalytics', () => ({
  trackProductEvent: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseEntitlement = useEntitlement as jest.MockedFunction<typeof useEntitlement>;
const mockSaveCloudCycle = saveCloudCycle as jest.MockedFunction<typeof saveCloudCycle>;
const mockLoadCloudCycle = loadCloudCycle as jest.MockedFunction<typeof loadCloudCycle>;
const mockSubscribe = subscribeToCloudCycles as jest.Mock;
const mockReadLocalTestAccount = readLocalTestAccount as jest.MockedFunction<typeof readLocalTestAccount>;

const basePayload: GFCForecastSaveData = {
  version: '1.0.0',
  type: 'forecast-cycle',
  timestamp: '2026-07-14T00:00:00.000Z',
  forecastCycle: {
    days: {},
    currentDay: 1,
    cycleDate: '2026-07-14',
  },
  mapView: { center: [39.8283, -98.5795], zoom: 4 },
};

describe('enqueueCloudSave', () => {
  test('waits for an older write before starting a newer write', async () => {
    const saveQueueRef = { current: Promise.resolve() };
    let resolveFirst: (() => void) | undefined;
    const started: string[] = [];

    const first = enqueueCloudSave(saveQueueRef, async () => {
      started.push('first');
      await new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
    });
    const second = enqueueCloudSave(saveQueueRef, async () => {
      started.push('second');
    });

    await Promise.resolve();
    expect(started).toEqual(['first']);

    resolveFirst?.();
    await Promise.all([first, second]);

    expect(started).toEqual(['first', 'second']);
  });
});

describe('canApplyCloudSaveResult', () => {
  test('rejects a completion after sign-out even when no cycle was selected', () => {
    expect(canApplyCloudSaveResult({
      expectedCycleId: null,
      currentCycleId: undefined,
      expectedUserId: 'user-1',
      currentUserId: undefined,
    })).toBe(false);
  });
});

describe('buildLoadedCloudForecastPayload', () => {
  test('attaches normalized workflow metadata for workflow-backed cloud cycles', () => {
    const workflowMetadata = {
      id: 'cycle-1',
      workflowId: 'severe-day1',
      cycleDate: '2026-07-14',
      version: 1,
      status: 'in-progress' as const,
      outlookVersions: [],
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    };

    const payload = buildLoadedCloudForecastPayload({
      payload: basePayload,
      workflowMetadata,
    } as CloudCycle);

    expect(payload.cycleMetadata).toEqual(workflowMetadata);
  });

  test('clears stale embedded workflow metadata for plain cloud cycles', () => {
    const payload = buildLoadedCloudForecastPayload({
      payload: {
        ...basePayload,
        cycleMetadata: {
          id: 'stale-cycle',
          workflowId: 'severe-day1',
          cycleDate: '2026-07-14',
          version: 1,
          status: 'in-progress',
          outlookVersions: [],
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
        },
      },
    } as CloudCycle);

    expect(payload.cycleMetadata).toBeNull();
    expect(payload).not.toHaveProperty('cycleMetadata', expect.objectContaining({ id: 'stale-cycle' }));
  });

  test('preserves custom geometry and appearance when loading a cloud payload', () => {
    const customLayers = {
      schemaVersion: '1.0.0' as const,
      layers: [{
        schemaVersion: '1.0.0' as const, id: 'layer-1' as never, label: 'Fire', order: 0,
        categories: [{ id: 'cat-1' as never, label: 'Critical', order: 0, style: { fillColor: '#ef4444', fillOpacity: .6, strokeColor: '#123456', strokeOpacity: .4, strokeWidth: 4, hatch: 'crosshatch' as const } }],
        features: [{ type: 'Feature' as const, id: 'feature-1', geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { customLayerId: 'layer-1' as never, categoryId: 'cat-1' as never, title: 'Critical' } }],
        createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
      }],
    };
    const cloudPayload = {
      ...basePayload,
      forecastCycle: {
        ...basePayload.forecastCycle!,
        days: { 1: { day: 1, data: {}, metadata: { issueDate: '', validDate: '', issuanceTime: '' }, customLayers } },
      },
    } as GFCForecastSaveData;

    const loaded = buildLoadedCloudForecastPayload({ payload: cloudPayload } as CloudCycle);
    expect(loaded.forecastCycle?.days[1]?.customLayers).toEqual(customLayers);
  });
});

describe('canApplyCloudSaveSelection', () => {
  test('rejects a late save-as-new completion after the selected cycle changes', () => {
    expect(canApplyCloudSaveSelection('cycle-1', 'cycle-2')).toBe(false);
    expect(canApplyCloudSaveSelection(null, 'cycle-2')).toBe(false);
  });

  test('accepts a completion when the selection is unchanged', () => {
    expect(canApplyCloudSaveSelection('cycle-1', 'cycle-1')).toBe(true);
    expect(canApplyCloudSaveSelection(null, undefined)).toBe(true);
  });
});

describe('useCloudCycles stale completions', () => {
  const stats = { forecastDays: 1, totalOutlooks: 1, totalFeatures: 0 };
  const payload = basePayload;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadLocalTestAccount.mockReturnValue(null);
    mockUseEntitlement.mockReturnValue({ premiumActive: true } as ReturnType<typeof useEntitlement>);
    mockSubscribe.mockImplementation(({ onUpdate }: { onUpdate: (cycles: unknown[]) => void }) => {
      onUpdate([
        { id: 'cycle-1', userId: 'user-1', label: 'One', cycleDate: '2026-07-14', createdAt: '2026-07-14T00:00:00.000Z', updatedAt: '2026-07-14T00:00:00.000Z' },
        { id: 'cycle-2', userId: 'user-1', label: 'Two', cycleDate: '2026-07-14', createdAt: '2026-07-14T00:00:00.000Z', updatedAt: '2026-07-14T00:00:00.000Z' },
      ]);
      return jest.fn();
    });
  });

  const mockSignedInUser = () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as ReturnType<typeof useAuth>);
  };

  const renderSignedInCycles = () => {
    mockSignedInUser();
    return renderHook(() => useCloudCycles());
  };

  type PendingLoadResolution = { success: true; data: CloudCycle } | { success: false; error: string };

  type PendingSaveResolution = { success: true; data: string } | { success: false; error: string };

  const mockDeferredOnce = <T>(mockFn: { mockImplementationOnce: (impl: () => never) => unknown }) => {
    let resolveDeferred: ((value: T) => void) | undefined;
    mockFn.mockImplementationOnce(
      () =>
        new Promise<T>((resolve) => {
          resolveDeferred = resolve;
        }) as never,
    );
    return { resolve: (value: T) => resolveDeferred?.(value) };
  };

  const mockPendingLoadResult = () => {
    const deferred = mockDeferredOnce<PendingLoadResolution>(mockLoadCloudCycle);
    return {
      resolveSuccess: () => deferred.resolve({ success: true, data: { payload, workflowMetadata: undefined } as unknown as CloudCycle }),
      resolveFailure: (error = 'boom') => deferred.resolve({ success: false, error }),
    };
  };

  const mockPendingSave = () => {
    const deferred = mockDeferredOnce<PendingSaveResolution>(mockSaveCloudCycle);
    return {
      resolveSuccess: (data = 'cycle-1') => deferred.resolve({ success: true, data }),
      resolveFailure: (error = 'boom') => deferred.resolve({ success: false, error }),
    };
  };

  test('load start stays scoped when loading another cycle', async () => {
    const firstLoad = mockPendingLoadResult();
    const { result } = renderSignedInCycles();

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.markAsCurrent('cycle-2', 'Two');
    });

    let pendingFirstLoad: Promise<unknown> | undefined;
    await act(async () => {
      pendingFirstLoad = result.current.loadCycle('cycle-1');
      await Promise.resolve();
    });
    expect(result.current.currentCloud?.id).toBe('cycle-2');
    expect(result.current.currentCloud?.syncState).toBe('idle');

    await act(async () => {
      firstLoad.resolveSuccess();
      await pendingFirstLoad;
    });
  });

  const runStaleLoadScenario = async ({
    initialSelection,
    finalSelection,
    completeLoad,
  }: {
    initialSelection: { id: string; label: string };
    finalSelection: { id: string; label: string };
    completeLoad: (pendingLoad: ReturnType<typeof mockPendingLoadResult>) => void;
  }) => {
    const pendingLoadResult = mockPendingLoadResult();
    const { result } = renderSignedInCycles();

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.markAsCurrent(initialSelection.id, initialSelection.label);
    });

    let pendingLoad: Promise<unknown> | undefined;
    await act(async () => {
      pendingLoad = result.current.loadCycle('cycle-1');
      await Promise.resolve();
    });

    act(() => {
      result.current.markAsCurrent(finalSelection.id, finalSelection.label);
    });

    await act(async () => {
      completeLoad(pendingLoadResult);
      await pendingLoad;
    });

    return result.current;
  };

  test.each([
    {
      name: 'stale load success cannot replace a later selected cycle',
      initialSelection: { id: 'cycle-2', label: 'Two' },
      finalSelection: { id: 'cycle-3', label: 'Three' },
      completeLoad: (pendingLoad: ReturnType<typeof mockPendingLoadResult>) => pendingLoad.resolveSuccess(),
    },
    {
      name: 'stale load failure after a selection switch cannot set global error',
      initialSelection: { id: 'cycle-3', label: 'Three' },
      finalSelection: { id: 'cycle-2', label: 'Two' },
      completeLoad: (pendingLoad: ReturnType<typeof mockPendingLoadResult>) => pendingLoad.resolveFailure('boom'),
    },
  ])('$name', async ({ initialSelection, finalSelection, completeLoad }) => {
    const current = await runStaleLoadScenario({ initialSelection, finalSelection, completeLoad });
    expect(current.currentCloud?.id).toBe(finalSelection.id);
    expect(current.currentCloud?.syncState).toBe('idle');
    expect(current.error).toBeNull();
  });

  test('sign-out while a save is pending prevents queued writes and cannot restore sync state', async () => {
    mockSignedInUser();
    const deferred = mockPendingSave();

    const { result, rerender } = renderHook(() => useCloudCycles());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.markAsCurrent('cycle-1', 'One');
    });

    let pendingSave: Promise<boolean> | undefined;
    await act(async () => {
      pendingSave = result.current.saveCycle('One', '2026-07-14', stats, payload);
      await Promise.resolve();
    });
    expect(result.current.currentCloud?.syncState).toBe('saving');

    let queuedSave: Promise<boolean> | undefined;
    await act(async () => {
      queuedSave = result.current.saveCycle('One', '2026-07-14', stats, payload);
      await Promise.resolve();
    });

    mockUseAuth.mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuth>);
    rerender();

    let saveResults: boolean[] | undefined;
    await act(async () => {
      deferred.resolveSuccess();
      saveResults = await Promise.all([pendingSave!, queuedSave!]);
    });

    expect(saveResults).toEqual([true, false]);
    expect(mockSaveCloudCycle).toHaveBeenCalledTimes(1);
    expect(result.current.currentCloud).toBeNull();
  });

  test('stale save failure surfaces actual error without overwriting the new selection', async () => {
    mockSignedInUser();
    const deferred = mockPendingSave();

    const { result } = renderHook(() => useCloudCycles());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.markAsCurrent('cycle-1', 'One');
    });

    let pendingSave: Promise<boolean> | undefined;
    await act(async () => {
      pendingSave = result.current.saveCycle('One', '2026-07-14', stats, payload);
      await Promise.resolve();
    });
    expect(result.current.currentCloud?.syncState).toBe('saving');

    act(() => {
      result.current.markAsCurrent('cycle-2', 'Two');
    });

    let saveError: unknown;
    await act(async () => {
      deferred.resolveFailure('boom');
      try {
        await pendingSave;
      } catch (error) {
        saveError = error;
      }
    });

    expect(saveError).toBeInstanceOf(Error);
    expect((saveError as Error).message).toBe('boom');
    expect(result.current.currentCloud?.id).toBe('cycle-2');
    expect(result.current.currentCloud?.syncState).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  test('immediate manual save after selection captures the new cycle', async () => {
    mockSignedInUser();
    mockSaveCloudCycle.mockResolvedValue({ success: true, data: 'cycle-2' });

    const { result } = renderHook(() => useCloudCycles());

    await act(async () => {
      await Promise.resolve();
    });

    let pendingSave: Promise<boolean> | undefined;
    await act(async () => {
      result.current.markAsCurrent('cycle-2', 'Two');
      pendingSave = result.current.saveCycle('Two', '2026-07-14', stats, payload);
      await Promise.resolve();
    });

    await act(async () => {
      await pendingSave;
    });

    expect(mockSaveCloudCycle).toHaveBeenCalledWith(expect.objectContaining({ existingId: 'cycle-2' }));
    expect(result.current.currentCloud?.id).toBe('cycle-2');
    expect(result.current.currentCloud?.syncState).toBe('saved');
  });
});
