import { renderHook, act } from '@testing-library/react';
import { useCloudSync } from '../useCloudSync';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import forecastReducer from '../../store/forecastSlice';

jest.useFakeTimers();

const mockSerializeForecast = jest.fn(() => ({
  forecastCycle: { cycleDate: '2026-04-22' },
  mapView: { center: [0, 0], zoom: 4 },
}));
jest.mock('../../utils/fileUtils', () => ({
  serializeForecast: (...args: unknown[]) => mockSerializeForecast(...args),
}));
jest.mock('../../utils/forecastMetrics', () => ({
  countForecastMetrics: () => ({ features: 5 }),
}));
jest.mock('../../billing/EntitlementProvider', () => ({
  useEntitlement: () => ({ premiumActive: true }),
}));

const createStore = () => configureStore({
  reducer: { forecast: forecastReducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});

const renderHookWithStore = (hook: () => unknown) => {
  const store = createStore();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return { store, ...renderHook(hook, { wrapper }) };
};

const mockCloud = {
  currentCloud: { id: 'cycle-1', label: 'Test Cycle', syncState: 'idle' as const },
  updateSyncState: jest.fn(),
  saveCycle: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
};

describe('useCloudSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    mockSerializeForecast.mockClear();
  });

  test('returns isSynced=true when currentCloud equals saved', () => {
    const { result, rerender } = renderHookWithStore(() => useCloudSync(mockCloud));

    act(() => {
      result.current.markCurrentStateSynced();
    });
    rerender();

    expect(result.current.isSynced).toBe(true);
  });

  test('returns isSynced=false after forecast state changes', () => {
    const { store, result } = renderHookWithStore(() => useCloudSync(mockCloud));

    act(() => {
      store.dispatch({ type: 'forecast/setCycleDate', payload: '2026-04-23' });
    });

    expect(result.current.isSynced).toBe(false);
  });

  test('syncNow triggers an immediate save', async () => {
    const { result } = renderHookWithStore(() => useCloudSync(mockCloud));

    await act(async () => {
      await result.current.syncNow();
    });

    expect(mockCloud.saveCycle).toHaveBeenCalled();
  });

  test('does not sync when currentCloud is null', () => {
    const noCloudMock = { currentCloud: null, updateSyncState: jest.fn(), saveCycle: jest.fn() };
    const { store, result } = renderHookWithStore(() => useCloudSync(noCloudMock));

    act(() => {
      store.dispatch({ type: 'forecast/setCycleDate', payload: '2026-04-23' });
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.isSynced).toBe(false);
    expect(noCloudMock.saveCycle).not.toHaveBeenCalled();
    expect(noCloudMock.updateSyncState).not.toHaveBeenCalled();
  });
});
