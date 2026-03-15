import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ForecastPage from './ForecastPage';
import forecastReducer, { addFeature } from '../store/forecastSlice';
import featureFlagsReducer from '../store/featureFlagsSlice';
import overlaysReducer from '../store/overlaysSlice';
import stormReportsReducer from '../store/stormReportsSlice';
import appModeReducer from '../store/appModeSlice';
import themeReducer from '../store/themeSlice';
import verificationReducer from '../store/verificationSlice';

jest.mock('../components/Map/ForecastMap', () => {
  const React = require('react');
  return React.forwardRef(() => <div>ForecastMap Mock</div>);
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

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({
    addToast: jest.fn(),
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

describe('ForecastPage keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('Ctrl/Cmd+Z dispatches undo', () => {
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature('feature-1') }));

    render(
      <Provider store={store}>
        <ForecastPage />
      </Provider>
    );

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    const features = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%') || [];
    expect(features).toHaveLength(0);
  });

  test('Ctrl+Y and Shift+Ctrl/Cmd+Z dispatch redo', () => {
    const store = createStore();
    store.dispatch(addFeature({ feature: createFeature('feature-1') }));

    render(
      <Provider store={store}>
        <ForecastPage />
      </Provider>
    );

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
      <Provider store={store}>
        <>
          <ForecastPage />
          <input aria-label="typing target" />
        </>
      </Provider>
    );

    const input = screen.getByLabelText('typing target');
    input.focus();
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });

    const features = store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%') || [];
    expect(features).toHaveLength(1);
  });
});
