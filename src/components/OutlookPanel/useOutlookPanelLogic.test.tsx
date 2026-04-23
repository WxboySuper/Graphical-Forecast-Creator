import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useOutlookPanelLogic } from './useOutlookPanelLogic';
import forecastReducer from '../../store/forecastSlice';
import featureFlagsReducer from '../../store/featureFlagsSlice';

jest.mock('../../utils/outlookUtils', () => ({
  getOutlookConstraints: jest.fn((day: number) => ({
    outlookTypes: ['tornado', 'wind', 'hail', 'categorical', 'totalSevere', 'day4-8'],
    probabilities: {
      tornado: ['2%', '5%', '10%', '15%', '20%', '30%', '40%', '50%'],
      wind: ['5%', '10%', '15%', '20%', '30%', '40%', '50%'],
      hail: ['5%', '10%', '15%', '20%', '30%', '40%', '50%'],
      totalSevere: ['10%', '15%', '20%', '30%', '40%'],
      'day4-8': ['15%', '30%'],
    },
    allowedCIG: ['CIG1', 'CIG2', 'CIG3'],
    requiresConversion: day <= 3,
  })),
}));

const createStore = (preloadedState = {}) => configureStore({
  reducer: {
    forecast: forecastReducer,
    featureFlags: featureFlagsReducer,
  },
  preloadedState: {
    forecast: forecastReducer(undefined, { type: '@@INIT' }),
    featureFlags: featureFlagsReducer(undefined, { type: '@@INIT' }),
    ...preloadedState,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});

const renderHookWithStore = (hook: () => unknown, store = createStore()) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(hook, { wrapper });
};

describe('useOutlookPanelLogic', () => {
  it('returns default values from Redux state', () => {
    const { result } = renderHookWithStore(() => useOutlookPanelLogic());
    expect(result.current.activeOutlookType).toBeDefined();
    expect(result.current.activeProbability).toBeDefined();
  });

  it('getOutlookTypeEnabled returns true for enabled outlook types', () => {
    const { result } = renderHookWithStore(() => useOutlookPanelLogic());
    expect(typeof result.current.getOutlookTypeEnabled).toBe('function');
    expect(result.current.getOutlookTypeEnabled('tornado')).toBe(true);
    expect(result.current.getOutlookTypeEnabled('wind')).toBe(true);
    expect(result.current.getOutlookTypeEnabled('hail')).toBe(true);
  });

  it('handleOutlookTypeChange is a function', () => {
    const { result } = renderHookWithStore(() => useOutlookPanelLogic());
    expect(typeof result.current.handleOutlookTypeChange).toBe('function');
  });

  it('handleProbabilityChange is a function', () => {
    const { result } = renderHookWithStore(() => useOutlookPanelLogic());
    expect(typeof result.current.handleProbabilityChange).toBe('function');
  });

  it('probabilities is an array', () => {
    const { result } = renderHookWithStore(() => useOutlookPanelLogic());
    expect(Array.isArray(result.current.probabilities)).toBe(true);
  });

  it('probabilityHandlers is an object of functions', () => {
    const { result } = renderHookWithStore(() => useOutlookPanelLogic());
    expect(typeof result.current.probabilityHandlers).toBe('object');
  });

  it('outlookTypeHandlers is an object of functions', () => {
    const { result } = renderHookWithStore(() => useOutlookPanelLogic());
    expect(typeof result.current.outlookTypeHandlers).toBe('object');
    expect(typeof result.current.outlookTypeHandlers.tornado).toBe('function');
  });
});