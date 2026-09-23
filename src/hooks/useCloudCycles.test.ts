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

  test('stale load cannot update a different selected cycle', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as ReturnType<typeof useAuth>);
    let resolveLoad: ((value: { success: true; data: CloudCycle }) => void) | undefined;
    mockLoadCloudCycle.mockImplementationOnce(
      () =>
        new Promise<{ success: true; data: CloudCycle }>((resolve) => {
          resolveLoad = resolve;
        }) as never,
    );

    const { result } = renderHook(() => useCloudCycles());

    await act(async () => {
      await Promise.resolve();
    });

    let pendingLoad: Promise<unknown> | undefined;
    await act(async () => {
      pendingLoad = result.current.loadCycle('cycle-1');
      await Promise.resolve();
    });

    act(() => {
      result.current.markAsCurrent('cycle-2', 'Two');
    });
    expect(result.current.currentCloud?.id).toBe('cycle-2');

    await act(async () => {
      resolveLoad?.({ success: true, data: { payload, workflowMetadata: undefined } as unknown as CloudCycle });
      await pendingLoad;
    });

    expect(result.current.currentCloud?.id).toBe('cycle-2');
    expect(result.current.currentCloud?.syncState).not.toBe('saved');
  });

  test('starting a load cannot mark a newly selected cycle as loading', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as ReturnType<typeof useAuth>);
    let resolveLoad: ((value: { success: true; data: CloudCycle }) => void) | undefined;
    mockLoadCloudCycle.mockImplementationOnce(
      () =>
        new Promise<{ success: true; data: CloudCycle }>((resolve) => {
          resolveLoad = resolve;
        }) as never,
    );

    const { result } = renderHook(() => useCloudCycles());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.markAsCurrent('cycle-2', 'Two');
    });
    expect(result.current.currentCloud?.syncState).toBe('idle');

    let pendingLoad: Promise<unknown> | undefined;
    await act(async () => {
      pendingLoad = result.current.loadCycle('cycle-1');
      await Promise.resolve();
    });

    expect(result.current.currentCloud?.id).toBe('cycle-2');
    expect(result.current.currentCloud?.syncState).toBe('idle');

    await act(async () => {
      resolveLoad?.({ success: true, data: { payload, workflowMetadata: undefined } as unknown as CloudCycle });
      await pendingLoad;
    });

    expect(result.current.currentCloud?.id).toBe('cycle-1');
    expect(result.current.currentCloud?.syncState).toBe('saved');
  });

  test('sign-out while a save is pending cannot restore sync state', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } } as ReturnType<typeof useAuth>);
    let resolveSave: ((value: { success: true; data: string }) => void) | undefined;
    mockSaveCloudCycle.mockImplementationOnce(
      () =>
        new Promise<{ success: true; data: string }>((resolve) => {
          resolveSave = resolve;
        }) as never,
    );

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

    mockUseAuth.mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuth>);
    rerender();

    await act(async () => {
      resolveSave?.({ success: true, data: 'cycle-1' });
      await pendingSave;
    });

    expect(result.current.currentCloud).toBeNull();
  });
});
