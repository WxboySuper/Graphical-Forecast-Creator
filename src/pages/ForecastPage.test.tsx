import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import ForecastPage, { getDayRolloverPromptState, runDayRolloverSaveAction } from './ForecastPage';
import forecastReducer, { addFeature, markAsSaved } from '../store/forecastSlice';
import featureFlagsReducer from '../store/featureFlagsSlice';
import overlaysReducer from '../store/overlaysSlice';
import stormReportsReducer from '../store/stormReportsSlice';
import appModeReducer from '../store/appModeSlice';
import themeReducer from '../store/themeSlice';
import verificationReducer from '../store/verificationSlice';
import { getLocalCalendarDate } from '../utils/localDate';

const mockAddToast = jest.fn();

jest.mock('../components/Map/ForecastMap', () => {
  const { forwardRef } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: forwardRef(() => <div>ForecastMap Mock</div>),
  };
});

jest.mock('../components/IntegratedToolbar/IntegratedToolbar', () => ({
  IntegratedToolbar: () => <div>IntegratedToolbar Mock</div>,
}));

jest.mock('../hooks/useAutoSave', () => ({
  useAutoSave: jest.fn(),
}));

jest.mock('../hooks/useAutoCategorical', () => jest.fn());
jest.mock('../utils/cycleHistoryPersistence', () => ({
  useCycleHistoryPersistence: jest.fn(),
}));
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: () => ({ premiumActive: false, effectiveSource: 'none' }),
}));
jest.mock('../hooks/useCloudCycles', () => ({
  useCloudCycles: () => ({
    currentCloud: null,
    saveCycle: jest.fn(),
    markAsCurrent: jest.fn(),
  }),
}));
jest.mock('../hooks/useCloudSync', () => ({
  useCloudSync: () => ({
    markCurrentStateSynced: jest.fn(),
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({
    addToast: mockAddToast,
  }),
}));

const createStore = () => configureStore({
  reducer: {
    forecast: forecastReducer,
    featureFlags: featureFlagsReducer,
    overlays: overlaysReducer,
    stormReports: stormReportsReducer,
    appMode: appModeReducer,
    theme: themeReducer,
    verification: verificationReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});

const createFeature = (id: string) => ({
  type: 'Feature' as const,
  id,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  },
  properties: {
    outlookType: 'tornado' as const,
    probability: '2%',
    isSignificant: false,
  },
});

const renderForecastPage = (store: ReturnType<typeof createStore>) =>
  render(
    <MemoryRouter>
      <Provider store={store}>
        <ForecastPage />
      </Provider>
    </MemoryRouter>
  );

const getPromptStateForStore = (
  store: ReturnType<typeof createStore>,
  overrides: Partial<Parameters<typeof getDayRolloverPromptState>[0]> = {}
) =>
  getDayRolloverPromptState({
    restoreComplete: true,
    lastActiveDay: '2026-04-01',
    today: '2026-04-02',
    alreadyPromptedToday: false,
    promptOpen: false,
    forecastCycle: store.getState().forecast.forecastCycle,
    isSaved: store.getState().forecast.isSaved,
    ...overrides,
  });

describe('ForecastPage keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockAddToast.mockReset();
  });

  test('Ctrl/Cmd+Z dispatches undo', () => {
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature('feature-1') }));

    renderForecastPage(store);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    const features = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%') || [];
    expect(features).toHaveLength(0);
  });

  test('Ctrl+Y and Shift+Ctrl/Cmd+Z dispatch redo', () => {
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature('feature-1') }));

    renderForecastPage(store);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });

    let features = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%') || [];
    expect(features).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });

    features = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%') || [];
    expect(features).toHaveLength(1);
  });

  test('shortcuts do not fire while typing in an input', () => {
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature('feature-1') }));

    render(
      <MemoryRouter>
        <Provider store={store}>
          <>
            <ForecastPage />
            <input aria-label="typing target" />
          </>
        </Provider>
      </MemoryRouter>
    );

    const input = screen.getByLabelText('typing target');
    input.focus();
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });

    const features = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%') || [];
    expect(features).toHaveLength(1);
  });
});

describe('ForecastPage day rollover prompt', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-02T12:00:00'));
    localStorage.clear();
    sessionStorage.clear();
    mockAddToast.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns prompt state when the last active day differs from today and the session has unsaved work', () => {
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature('feature-1') }));

    const promptState = getPromptStateForStore(store);

    expect(promptState).toEqual({
      previousDay: '2026-04-01',
      currentDay: '2026-04-02',
    });
  });

  test('does not return prompt state when the user was already prompted today', () => {
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature('feature-1') }));

    const promptState = getPromptStateForStore(store, {
      today: getLocalCalendarDate(),
      alreadyPromptedToday: true,
    });

    expect(promptState).toBeNull();
  });

  test('saves the previous session to cycle history and resets when the user confirms', () => {
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature('feature-1') }));
    const didSaveSession = runDayRolloverSaveAction({
      forecastCycle: store.getState().forecast.forecastCycle,
      isSaved: store.getState().forecast.isSaved,
      dispatch: store.dispatch,
    });

    const state = store.getState().forecast;
    const currentFeatures = state.forecastCycle.days[1]?.data.tornado?.get('2%') || [];

    expect(didSaveSession).toBe(true);
    expect(state.savedCycles).toHaveLength(1);
    expect(currentFeatures).toHaveLength(0);
    expect(state.forecastCycle.cycleDate).toBe('2026-04-02');
  });

  test('does not prompt for already-saved work from a previous day', () => {
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature('feature-1') }));
    store.dispatch(markAsSaved());

    const promptState = getPromptStateForStore(store);

    expect(promptState).toBeNull();
  });
});
