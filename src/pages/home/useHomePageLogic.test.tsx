import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer from '../../store/forecastSlice';
import useHomePageLogic from './useHomePageLogic';
import type { SavedCycle } from '../../store/forecastSlice';

const navigate = jest.fn();
const addToast = jest.fn();
const handleFileSelect = jest.fn();
const handleOpenFilePicker = jest.fn();
const handleSave = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigate,
  useOutletContext: () => ({ addToast }),
}));

jest.mock('../../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../hooks/useFileLoader', () => ({
  createFileHandlers: jest.fn(() => ({
    fileInputRef: { current: null },
    handleFileSelect,
    handleOpenFilePicker,
    handleSave,
  })),
}));

const mockUseAuth = jest.requireMock('../../auth/AuthProvider').useAuth as jest.Mock;

const buildStore = (overrides?: Partial<ReturnType<typeof forecastReducer>>) => {
  const forecastState = { ...forecastReducer(undefined, { type: '@@INIT' }), ...(overrides ?? {}) };

  return configureStore({
    reducer: { forecast: forecastReducer },
    preloadedState: { forecast: forecastState },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
};

const wrapper = (store: ReturnType<typeof buildStore>) => ({ children }: { children: React.ReactNode }) =>
  <Provider store={store}>{children}</Provider>;

describe('useHomePageLogic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: 'signed_in',
    });
  });

  test('returns signed-in home state and handles quick-start, history, and cycle loading', () => {
    const savedCycleForecast = forecastReducer(undefined, { type: '@@INIT' }).forecastCycle;
    const savedCycles: SavedCycle[] = [
      {
        id: 'cycle-1',
        timestamp: '2026-03-27T12:00:00Z',
        cycleDate: '2026-03-27',
        label: 'Day 1',
        forecastCycle: {
          ...savedCycleForecast,
          currentDay: 8,
          cycleDate: '2026-03-27',
        },
        stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
      },
    ];

    const store = buildStore({
      forecastCycle: {
        ...forecastReducer(undefined, { type: '@@INIT' }).forecastCycle,
        currentDay: 2,
        cycleDate: '2026-03-27',
      },
      savedCycles,
      isSaved: false,
    });

    const { result } = renderHook(() => useHomePageLogic(), { wrapper: wrapper(store) });

    expect(result.current.variant).toBe('signed_in');
    expect(result.current.formattedDate).toBeTruthy();
    expect(result.current.stats.savedCyclesCount).toBe(1);

    act(() => {
      result.current.handleOpenHistoryModal();
    });
    expect(result.current.showHistoryModal).toBe(true);

    act(() => {
      result.current.handleCloseHistoryModal();
    });
    expect(result.current.showHistoryModal).toBe(false);

    act(() => {
      result.current.handleQuickStartClick({ currentTarget: { dataset: { day: '5' } } } as React.MouseEvent<HTMLButtonElement>);
    });
    expect(navigate).toHaveBeenCalledWith('/forecast');
    expect(store.getState().forecast.forecastCycle.currentDay).toBe(5);

    act(() => {
      result.current.handleLoadRecentCycleClick({ currentTarget: { dataset: { cycleId: 'cycle-1' } } } as React.MouseEvent<HTMLButtonElement>);
    });
    expect(addToast).toHaveBeenCalledWith('Cycle loaded from history', 'success');
    expect(store.getState().forecast.forecastCycle.currentDay).toBe(8);

    act(() => {
      result.current.handleNewCycle();
    });

    act(() => {
      result.current.handleConfirmNewCycle();
    });
    expect(addToast).toHaveBeenCalledWith('Started new forecast cycle', 'success');
    expect(store.getState().forecast.forecastCycle.currentDay).toBe(1);
    expect(result.current.confirmNewCycle).toBe(false);

    act(() => {
      result.current.handleCancelNewCycle();
    });
    expect(result.current.confirmNewCycle).toBe(false);
  });

  test('starts a new cycle immediately when the workspace is already saved', () => {
    const store = buildStore({ isSaved: true });

    const { result } = renderHook(() => useHomePageLogic(), { wrapper: wrapper(store) });

    act(() => {
      result.current.handleNewCycle();
    });

    expect(store.getState().forecast.isSaved).toBe(false);
    expect(addToast).toHaveBeenCalledWith('Started new forecast cycle', 'success');
    expect(result.current.confirmNewCycle).toBe(false);
    expect(handleSave).toHaveBeenCalledTimes(0);
  });

  test('ignores malformed quick-start and recent-cycle clicks', () => {
    const store = buildStore({
      savedCycles: [
        {
          id: 'cycle-1',
          timestamp: '2026-03-27T12:00:00Z',
          cycleDate: '2026-03-27',
          label: 'Day 1',
          forecastCycle: forecastReducer(undefined, { type: '@@INIT' }).forecastCycle,
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
        },
      ],
    });

    const { result } = renderHook(() => useHomePageLogic(), { wrapper: wrapper(store) });

    act(() => {
      result.current.handleQuickStartClick({ currentTarget: { dataset: { day: 'not-a-number' } } } as React.MouseEvent<HTMLButtonElement>);
      result.current.handleLoadRecentCycleClick({ currentTarget: { dataset: {} } } as React.MouseEvent<HTMLButtonElement>);
      result.current.handleLoadRecentCycleClick({ currentTarget: { dataset: { cycleId: 'missing' } } } as React.MouseEvent<HTMLButtonElement>);
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });
});
