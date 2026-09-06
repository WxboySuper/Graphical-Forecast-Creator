import { act, renderHook } from '@testing-library/react';
import { useSelector } from 'react-redux';
import { useEntitlement } from '../billing/EntitlementProvider';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { serializeForecast } from '../utils/fileUtils';
import { useCloudSync } from './useCloudSync';
import { RootState } from '../store';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: jest.fn(),
}));

jest.mock('../utils/fileUtils', () => ({
  serializeForecast: jest.fn(),
}));

jest.mock('../utils/forecastMetrics', () => ({
  countForecastMetrics: jest.fn(),
}));

const mockUseSelector = useSelector as jest.MockedFunction<typeof useSelector>;
const mockUseEntitlement = useEntitlement as jest.MockedFunction<typeof useEntitlement>;
const mockSerializeForecast = serializeForecast as jest.MockedFunction<typeof serializeForecast>;
const mockCountForecastMetrics = countForecastMetrics as jest.MockedFunction<typeof countForecastMetrics>;

describe('useCloudSync', () => {
  const forecastCycle = { cycleDate: '2026-04-24', days: [] };
  const mapView = { center: [1, 2], zoom: 5 };
  const payload = { forecastCycle, mapView, savedAt: 'volatile' };
  const workflowMetadata = {
    id: 'WF-severe-day1-2026-04-24',
    workflowId: 'severe-day1',
    cycleDate: '2026-04-24',
    status: 'in-progress' as const,
    outlookVersions: [{ version: 1, status: 'in-progress' as const, createdAt: '2026-04-24T00:00:00.000Z' }],
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  };
  const saveCycle = jest.fn();
  const updateSyncState = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUseEntitlement.mockReturnValue({ premiumActive: true } as ReturnType<typeof useEntitlement>);
    mockSerializeForecast.mockReturnValue(payload as never);
    mockCountForecastMetrics.mockReturnValue({ forecastDays: 1, totalOutlooks: 2, totalFeatures: 3 });
    mockUseSelector.mockImplementation((selector: (state: RootState) => unknown) => selector({
      forecast: {
        forecastCycle,
        currentMapView: mapView,
        workflowMetadata,
      },
    } as RootState));
    saveCycle.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const cloud = (id = 'cloud-1') => ({
    currentCloud: { id, label: id === 'cloud-1' ? 'Storm Day' : 'Second Day', syncState: 'idle' as const },
    saveCycle,
    updateSyncState,
  });

  it('debounces automatic saves and marks successful syncs', async () => {
    renderHook(() => useCloudSync(cloud()));

    expect(saveCycle).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(updateSyncState).toHaveBeenCalledWith('saving', undefined, 'cloud-1');
    expect(saveCycle).toHaveBeenCalledWith('Storm Day', '2026-04-24', {
      forecastDays: 1,
      totalOutlooks: 2,
      totalFeatures: 3,
    }, payload, workflowMetadata);
    expect(updateSyncState).toHaveBeenCalledWith('saved', undefined, 'cloud-1');
  });

  it('syncs metadata-only changes after the initial state is synced', async () => {
    let currentWorkflowMetadata = workflowMetadata;
    mockSerializeForecast.mockImplementation((_forecastCycle, _mapView, metadata) => ({
      ...payload,
      cycleMetadata: metadata,
    } as never));
    mockUseSelector.mockImplementation((selector: (state: RootState) => unknown) => selector({
      forecast: {
        forecastCycle,
        currentMapView: mapView,
        workflowMetadata: currentWorkflowMetadata,
      },
    } as RootState));

    const { result, rerender } = renderHook(() => useCloudSync(cloud()));
    await act(async () => {
      await result.current.syncNow();
    });
    expect(saveCycle).toHaveBeenCalledTimes(1);

    currentWorkflowMetadata = { ...workflowMetadata, status: 'completed' };
    rerender();
    await act(async () => {
      await result.current.syncNow();
    });

    expect(saveCycle).toHaveBeenCalledTimes(2);
    expect(saveCycle.mock.calls[1][4]).toEqual(currentWorkflowMetadata);
  });

  it('syncs immediately, exposes synced state, and skips repeated identical state', async () => {
    const { result } = renderHook(() => useCloudSync(cloud()));

    await act(async () => {
      await result.current.syncNow();
    });

    expect(result.current.isSynced).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(saveCycle).toHaveBeenCalledTimes(1);
  });

  it('does not sync without premium access or current cloud context', async () => {
    mockUseEntitlement.mockReturnValue({ premiumActive: false } as ReturnType<typeof useEntitlement>);
    const { result } = renderHook(() => useCloudSync({ ...cloud(), currentCloud: null }));

    await act(async () => {
      await result.current.syncNow();
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.currentCloud).toBeNull();
    expect(mockSerializeForecast).not.toHaveBeenCalled();
    expect(saveCycle).not.toHaveBeenCalled();
  });

  it('reports failed and thrown sync attempts', async () => {
    saveCycle.mockResolvedValueOnce(false);
    const { result, rerender } = renderHook(() => useCloudSync(cloud()));

    await act(async () => {
      await result.current.syncNow();
    });
    expect(updateSyncState).toHaveBeenCalledWith('error', 'Failed to sync to cloud', 'cloud-1');

    saveCycle.mockRejectedValueOnce(new Error('network down'));
    mockSerializeForecast.mockReturnValue({ ...payload, mapView: { center: [3, 4], zoom: 6 } } as never);
    rerender();

    await act(async () => {
      await result.current.syncNow();
    });
    expect(updateSyncState).toHaveBeenCalledWith('error', 'network down', 'cloud-1');
  });

  it('can mark the current state as already synced', () => {
    const { result, rerender } = renderHook(() => useCloudSync(cloud()));

    act(() => {
      result.current.markCurrentStateSynced();
    });
    rerender();

    expect(result.current.isSynced).toBe(true);
  });

  it('does not treat identical content as synced after switching cloud cycles', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useCloudSync(cloud(id)), {
      initialProps: { id: 'cloud-1' },
    });

    await act(async () => {
      await result.current.syncNow();
    });
    expect(result.current.isSynced).toBe(true);

    rerender({ id: 'cloud-2' });
    expect(result.current.isSynced).toBe(false);

    await act(async () => {
      await result.current.syncNow();
    });
    expect(saveCycle).toHaveBeenCalledTimes(2);
  });

  it('keeps an out-of-order completion scoped to the cycle that started the save', async () => {
    let resolveSave: ((value: boolean) => void) | undefined;
    saveCycle.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      resolveSave = resolve;
    }));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useCloudSync(cloud(id)), {
      initialProps: { id: 'cloud-1' },
    });

    let pendingSync: Promise<void> | undefined;
    await act(async () => {
      pendingSync = result.current.syncNow();
      await Promise.resolve();
    });
    rerender({ id: 'cloud-2' });
    await act(async () => {
      resolveSave?.(true);
      await pendingSync;
    });

    expect(updateSyncState).toHaveBeenCalledWith('saved', undefined, 'cloud-1');
    expect(result.current.isSynced).toBe(false);
  });

  it('does not let an older completion replace a newer cycle synchronization', async () => {
    const resolvers: Array<(value: boolean) => void> = [];
    saveCycle.mockImplementation(() => new Promise<boolean>((resolve) => resolvers.push(resolve)));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useCloudSync(cloud(id)), {
      initialProps: { id: 'cloud-1' },
    });

    let firstSync: Promise<void> | undefined;
    await act(async () => {
      firstSync = result.current.syncNow();
      await Promise.resolve();
    });
    rerender({ id: 'cloud-2' });
    let secondSync: Promise<void> | undefined;
    await act(async () => {
      secondSync = result.current.syncNow();
      await Promise.resolve();
    });

    await act(async () => {
      resolvers[1]?.(true);
      await secondSync;
    });
    expect(result.current.isSynced).toBe(true);

    await act(async () => {
      resolvers[0]?.(true);
      await firstSync;
    });
    expect(result.current.isSynced).toBe(true);
  });
});
