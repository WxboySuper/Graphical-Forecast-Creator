
import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer, { setMapView } from './store/forecastSlice';
import featureFlagsReducer from './store/featureFlagsSlice';
import { AppContent } from './App';

// Mock child components
const mockForecastMap = jest.fn();

jest.mock('./components/Map/ForecastMap', () => {
  const React = require('react');
  return React.forwardRef((props: any, ref: any) => {
    mockForecastMap(props);
    return React.createElement('div', { 'data-testid': 'forecast-map' }, 'ForecastMap');
  });
});

jest.mock('./components/OutlookPanel/OutlookPanel', () => () => <div>OutlookPanel</div>);
jest.mock('./components/DrawingTools/DrawingTools', () => () => <div>DrawingTools</div>);
jest.mock('./components/Documentation/Documentation', () => () => <div>Documentation</div>);
jest.mock('./components/Toast/Toast', () => ({
  ToastManager: () => <div>ToastManager</div>
}));

// Mock leaflet
jest.mock('leaflet', () => ({
  featureGroup: () => ({
    getLayers: () => [],
    getBounds: () => {},
  }),
  geoJSON: () => ({
    addTo: () => {},
  }),
  Map: class {},
}));

describe('AppContent Performance', () => {
  let store: any;

  beforeEach(() => {
    mockForecastMap.mockClear();
    store = configureStore({
      reducer: {
        forecast: forecastReducer,
        featureFlags: featureFlagsReducer,
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
        <AppContent />
      </Provider>
    );

    // Initial render: 2 times (Mount + useEffect dispatch)
    expect(mockForecastMap).toHaveBeenCalledTimes(2);

    // Dispatch an action that changes `forecast` slice but NOT the data used by AppContent
    // setMapView changes state.forecast.currentMapView
    act(() => {
      store.dispatch(setMapView({ center: [40, -100], zoom: 5 }));
    });

    // With optimized selector: should remain 2
    expect(mockForecastMap).toHaveBeenCalledTimes(2);
  });
});
