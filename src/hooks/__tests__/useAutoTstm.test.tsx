import React from 'react';
import { Provider } from 'react-redux';
import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer, { setForecastDay } from '../../store/forecastSlice';
import { useAutoTstm } from '../useAutoTstm';
import { requestLatestTstmData } from '../../utils/tstmGeneration';

jest.mock('../../utils/tstmGeneration', () => {
  const actual = jest.requireActual<typeof import('../../utils/tstmGeneration')>('../../utils/tstmGeneration');
  return {
    ...actual,
    requestLatestTstmData: jest.fn(),
  };
});

const mockedRequestLatest = requestLatestTstmData as jest.MockedFunction<typeof requestLatestTstmData>;

const cachedResponse = {
  features: [{
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    },
    properties: { probability: 'TSTM' },
  }],
  run: '2026-06-13T12:00:00Z',
  domain: 'conus',
  forecastHours: [24],
  effectiveStart: '2026-06-13T12:00:00Z',
  effectiveEnd: '2026-06-14T12:00:00Z',
  thresholds: {
    calibratedThunderCoreProbability: 0.3,
    calibratedThunderSupportProbability: 0.1,
  },
  warnings: [],
  sources: {},
  generatedAt: '2026-06-13T12:00:00Z',
};

const createStore = () => configureStore({
  reducer: { forecast: forecastReducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});

const renderAutoTstm = () => {
  const store = createStore();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useAutoTstm(), { wrapper });
  return { store, ...hook };
};

describe('useAutoTstm', () => {
  beforeEach(() => {
    mockedRequestLatest.mockReset();
  });

  test('does not fetch when the panel is closed', () => {
    renderAutoTstm();
    expect(mockedRequestLatest).not.toHaveBeenCalled();
  });

  test('fetches cached guidance when the panel opens and exposes preview metadata', async () => {
    mockedRequestLatest.mockResolvedValue(cachedResponse);
    const { result } = renderAutoTstm();

    await act(async () => {
      result.current.openPanel();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('preview');
    });

    expect(mockedRequestLatest).toHaveBeenCalledWith(1, 'full', expect.any(AbortSignal));
    expect(result.current.previewResponse?.run).toBe('2026-06-13T12:00:00Z');
    expect(result.current.previewFeatures).toHaveLength(1);
  });

  test('keeps committed polygons unchanged when guidance is unavailable', async () => {
    mockedRequestLatest.mockResolvedValue(null);
    const { store, result } = renderAutoTstm();

    await act(async () => {
      result.current.openPanel();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(store.getState().forecast.forecastCycle.days[1]?.data.categorical?.get('TSTM')).toBeUndefined();
  });

  test('apply dispatches one undoable replacement and closes the panel', async () => {
    mockedRequestLatest.mockResolvedValue(cachedResponse);
    const { store, result } = renderAutoTstm();

    await act(async () => {
      result.current.openPanel();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('preview');
    });

    await act(async () => {
      result.current.applyPreview();
    });

    expect(store.getState().forecast.forecastCycle.days[1]?.data.categorical?.get('TSTM')).toHaveLength(1);
    expect(result.current.isPanelOpen).toBe(false);
    expect(result.current.previewFeatures).toHaveLength(0);
  });

  test('cancel clears preview without mutating forecast state', async () => {
    mockedRequestLatest.mockResolvedValue(cachedResponse);
    const { store, result } = renderAutoTstm();

    await act(async () => {
      result.current.openPanel();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('preview');
    });

    await act(async () => {
      result.current.cancelPreview();
    });

    expect(store.getState().forecast.forecastCycle.days[1]?.data.categorical?.get('TSTM')).toBeUndefined();
    expect(result.current.status).toBe('idle');
    expect(result.current.previewFeatures).toHaveLength(0);
  });

  test('ignores late responses after the forecast day changes', async () => {
    let resolveRequest: ((value: typeof cachedResponse) => void) | null = null;
    mockedRequestLatest.mockImplementation(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const { store, result } = renderAutoTstm();

    await act(async () => {
      result.current.openPanel();
    });

    await act(async () => {
      store.dispatch(setForecastDay(2));
    });

    await act(async () => {
      resolveRequest?.(cachedResponse);
    });

    await waitFor(() => {
      expect(result.current.status).not.toBe('preview');
    });
    expect(store.getState().forecast.forecastCycle.days[2]?.data.categorical?.get('TSTM')).toBeUndefined();
  });

  test('blocks stale apply after the day changes', async () => {
    mockedRequestLatest.mockResolvedValue(cachedResponse);
    const { store, result } = renderAutoTstm();

    await act(async () => {
      result.current.openPanel();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('preview');
    });

    await act(async () => {
      store.dispatch(setForecastDay(2));
    });

    await act(async () => {
      result.current.applyPreview();
    });

    expect(store.getState().forecast.forecastCycle.days[2]?.data.categorical?.get('TSTM')).toBeUndefined();
    expect(result.current.status).toBe('error');
  });
});
