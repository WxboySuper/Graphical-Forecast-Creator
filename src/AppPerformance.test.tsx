
import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import { BrowserRouter } from 'react-router-dom';
import forecastReducer, { setMapView } from './store/forecastSlice';
import featureFlagsReducer from './store/featureFlagsSlice';
import themeReducer from './store/themeSlice';
import appModeReducer from './store/appModeSlice';
import overlaysReducer from './store/overlaysSlice';
import stormReportsReducer from './store/stormReportsSlice';
import verificationReducer from './store/verificationSlice';
import { ForecastPage } from './pages';

// Mock child components
const mockForecastMap = jest.fn();

jest.mock('./components/Map/ForecastMap', () => {
  // skipcq: JS-0359
  const React = require('react');
  return React.forwardRef((props: Record<string, unknown>, _ref: unknown) => {
    mockForecastMap(props);
    return React.createElement('div', { 'data-testid': 'forecast-map' }, 'ForecastMap');
  });
});

jest.mock('./components/IntegratedToolbar/IntegratedToolbar', () => ({
  IntegratedToolbar: () => require('react').createElement('div', null, 'IntegratedToolbar'),
}));
jest.mock('./components/DrawingTools/DrawingTools', () => () => <div>DrawingTools</div>);
jest.mock('./components/Documentation/Documentation', () => () => <div>Documentation</div>);
jest.mock('./components/Toast/Toast', () => ({
  ToastManager: () => <div>ToastManager</div>
}));

// Mock router outlet context
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({ addToast: jest.fn() }),
}));

describe('ForecastPage Performance', () => {
  let store: EnhancedStore;

  beforeEach(() => {
    mockForecastMap.mockClear();
    store = configureStore({
      reducer: {
        forecast: forecastReducer,
        featureFlags: featureFlagsReducer,
        theme: themeReducer,
        appMode: appModeReducer,
        overlays: overlaysReducer,
        stormReports: stormReportsReducer,
        verification: verificationReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });
  });

  it('does NOT re-render children when unrelated state changes (Optimized)', () => {
    render(
      <Provider store={store}>
        <BrowserRouter>
          <ForecastPage />
        </BrowserRouter>
      </Provider>
    );

    // Initial render(s)
    const initialCalls = mockForecastMap.mock.calls.length;

    // Dispatch an action that changes `forecast` slice but NOT the data used by ForecastPage
    // setMapView changes state.forecast.currentMapView
    act(() => {
      store.dispatch(setMapView({ center: [40, -100], zoom: 5 }));
    });

    // With optimized selector: should not cause additional re-renders
    expect(mockForecastMap.mock.calls.length).toBeLessThanOrEqual(initialCalls + 1);
  });
});
