import { renderHook, act, waitFor } from '@testing-library/react';
import { useCloudCycles } from '../useCloudCycles';

const mockUseAuth = jest.fn();
const mockUseEntitlement = jest.fn();
const mockQueueProductMetric = jest.fn();
const mockSaveCloudCycle = jest.fn();
const mockLoadCloudCycle = jest.fn();
const mockDeleteCloudCycle = jest.fn();
const mockRenameCloudCycle = jest.fn();
const mockListCloudCycles = jest.fn();
const mockSubscribeToCloudCycles = jest.fn();

jest.mock('../../auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../../billing/EntitlementProvider', () => ({
  useEntitlement: () => mockUseEntitlement(),
}));

jest.mock('../../utils/productMetrics', () => ({
  queueProductMetric: (...args: unknown[]) => mockQueueProductMetric(...args),
}));

jest.mock('../../lib/cloudCyclesService', () => ({
  saveCloudCycle: (...args: unknown[]) => mockSaveCloudCycle(...args),
  loadCloudCycle: (...args: unknown[]) => mockLoadCloudCycle(...args),
  deleteCloudCycle: (...args: unknown[]) => mockDeleteCloudCycle(...args),
  renameCloudCycle: (...args: unknown[]) => mockRenameCloudCycle(...args),
  listCloudCycles: (...args: unknown[]) => mockListCloudCycles(...args),
  subscribeToCloudCycles: (...args: unknown[]) => mockSubscribeToCloudCycles(...args),
}));

describe('useCloudCycles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
    mockUseEntitlement.mockReturnValue({ premiumActive: true });
    mockSubscribeToCloudCycles.mockImplementation(({ onUpdate }) => {
      onUpdate([]);
      return jest.fn();
    });
    mockSaveCloudCycle.mockResolvedValue({ success: true, data: 'cycle-1' });
    mockLoadCloudCycle.mockResolvedValue({
      success: true,
      data: { id: 'cycle-1', payload: { version: '1', type: 'single-day', timestamp: '', outlooks: {} } },
    });
    mockRenameCloudCycle.mockResolvedValue({ success: true });
    mockDeleteCloudCycle.mockResolvedValue({ success: true });
    mockListCloudCycles.mockResolvedValue({
      success: true,
      data: [{ id: 'cycle-1', label: 'Cycle 1', userId: 'u1', cycleDate: '2026-04-22', createdAt: '', updatedAt: '', forecastDays: 1, totalOutlooks: 1, totalFeatures: 1, isReadOnly: false }],
    });
  });

  it('blocks write and load actions when user is not signed in', async () => {
    const { result } = renderHook(() => useCloudCycles());

    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(
      result.current.saveCycle('Label', '2026-04-22', { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 }, { version: '1', type: 'single-day', timestamp: '', outlooks: {} })
    ).resolves.toBe(false);
    await expect(result.current.loadCycle('cycle-1')).resolves.toBeNull();
    await waitFor(() => expect(result.current.error).toBe('Not signed in'));
  });

  it('subscribes for signed-in users and exposes received cycles', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });
    mockSubscribeToCloudCycles.mockImplementationOnce(({ onUpdate }) => {
      onUpdate([
        {
          id: 'cycle-1',
          label: 'Cycle 1',
          userId: 'u1',
          cycleDate: '2026-04-22',
          createdAt: '',
          updatedAt: '2026-04-22T01:00:00.000Z',
          forecastDays: 1,
          totalOutlooks: 1,
          totalFeatures: 1,
          isReadOnly: false,
        },
      ]);
      return jest.fn();
    });

    const { result } = renderHook(() => useCloudCycles());
    await waitFor(() => expect(result.current.cycles.length).toBe(1));
    expect(result.current.cycles[0].id).toBe('cycle-1');
  });

  it('enforces premium for save/delete/rename and succeeds once premium is active', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });
    mockUseEntitlement.mockReturnValue({ premiumActive: false });
    const { result, rerender } = renderHook(() => useCloudCycles());

    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(
      result.current.saveCycle('Label', '2026-04-22', { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 }, { version: '1', type: 'single-day', timestamp: '', outlooks: {} })
    ).resolves.toBe(false);
    await expect(result.current.renameCycle('cycle-1', 'New')).resolves.toBe(false);
    await expect(result.current.deleteCycle('cycle-1')).resolves.toBe(false);

    mockUseEntitlement.mockReturnValue({ premiumActive: true });
    rerender();

    await expect(
      result.current.saveCycle('Label', '2026-04-22', { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 }, { version: '1', type: 'single-day', timestamp: '', outlooks: {} })
    ).resolves.toBe(true);
    await waitFor(() => {
      expect(result.current.currentCloud?.id).toBe('cycle-1');
    });
    expect(mockQueueProductMetric).toHaveBeenCalledWith(expect.objectContaining({ event: 'cloud_cycle_saved' }));
  });

  it('loads, marks current, renames, deletes, refreshes, and updates sync state', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' } });
    mockSubscribeToCloudCycles.mockImplementationOnce(({ onUpdate }) => {
      onUpdate([
        {
          id: 'cycle-1',
          label: 'Cycle 1',
          userId: 'u1',
          cycleDate: '2026-04-22',
          createdAt: '',
          updatedAt: '2026-04-22T01:00:00.000Z',
          forecastDays: 1,
          totalOutlooks: 1,
          totalFeatures: 1,
          isReadOnly: false,
        },
      ]);
      return jest.fn();
    });

    const { result } = renderHook(() => useCloudCycles());
    await waitFor(() => expect(result.current.cycles.length).toBe(1));

    const payload = await result.current.loadCycle('cycle-1');
    expect(payload).not.toBeNull();
    expect(mockQueueProductMetric).toHaveBeenCalledWith(expect.objectContaining({ event: 'cloud_cycle_loaded' }));

    act(() => {
      result.current.markAsCurrent('cycle-1', 'Cycle 1');
      result.current.updateSyncState('saving');
    });
    expect(result.current.currentCloud?.syncState).toBe('saving');

    await expect(result.current.renameCycle('cycle-1', 'Renamed')).resolves.toBe(true);
    await waitFor(() => expect(result.current.currentCloud?.label).toBe('Renamed'));

    await expect(result.current.deleteCycle('cycle-1')).resolves.toBe(true);
    await waitFor(() => expect(result.current.currentCloud).toBeNull());

    await act(async () => {
      await result.current.refreshCycles();
    });
    expect(mockListCloudCycles).toHaveBeenCalled();

    act(() => {
      result.current.clearCurrent();
    });
    expect(result.current.currentCloud).toBeNull();
  });
});
