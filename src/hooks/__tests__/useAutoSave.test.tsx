import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import forecastReducer from '../../store/forecastSlice';

jest.useFakeTimers();

const mockSerializeForecast = jest.fn(() => ({ forecastCycle: {}, mapView: {} }));
jest.mock('../../utils/fileUtils', () => ({
  serializeForecast: (...args: unknown[]) => mockSerializeForecast(...args),
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

const getDifferentCycleDate = (currentCycleDate: string) => (
  currentCycleDate === '2099-01-01' ? '2099-01-02' : '2099-01-01'
);

describe('useAutoSave', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSerializeForecast.mockClear();
  });

  test('does not save on first render (debounce startup)', () => {
    const { store } = renderHookWithStore(() => useAutoSave());
    expect(mockSerializeForecast).not.toHaveBeenCalled();
  });

  test('saves to localStorage after debounce delay when forecast changes', () => {
    const { store } = renderHookWithStore(() => useAutoSave());
    const nextCycleDate = getDifferentCycleDate(store.getState().forecast.forecastCycle.cycleDate);

    act(() => {
      store.dispatch({ type: 'forecast/setCycleDate', payload: nextCycleDate });
    });

    act(() => {
      jest.advanceTimersByTime(5001);
    });

    expect(mockSerializeForecast).toHaveBeenCalled();
    expect(localStorage.getItem('forecastData')).not.toBeNull();
  });

  test('clears pending timer when forecast changes rapidly', () => {
    const { store } = renderHookWithStore(() => useAutoSave());
    const firstCycleDate = getDifferentCycleDate(store.getState().forecast.forecastCycle.cycleDate);
    const secondCycleDate = getDifferentCycleDate(firstCycleDate);

    act(() => {
      store.dispatch({ type: 'forecast/setCycleDate', payload: firstCycleDate });
      jest.advanceTimersByTime(1000);
    });

    act(() => {
      store.dispatch({ type: 'forecast/setCycleDate', payload: secondCycleDate });
      jest.advanceTimersByTime(1000);
    });

    act(() => {
      jest.advanceTimersByTime(5001);
    });

    expect(mockSerializeForecast).toHaveBeenCalled();
  });

  test('does not throw when serializeForecast throws', () => {
    mockSerializeForecast.mockImplementation(() => {
      throw new Error('serialization error');
    });

    const { store } = renderHookWithStore(() => useAutoSave());
    const nextCycleDate = getDifferentCycleDate(store.getState().forecast.forecastCycle.cycleDate);
    act(() => {
      store.dispatch({ type: 'forecast/setCycleDate', payload: nextCycleDate });
    });

    act(() => {
      jest.advanceTimersByTime(5001);
    });

    expect(mockSerializeForecast).toHaveBeenCalled();
  });
});
