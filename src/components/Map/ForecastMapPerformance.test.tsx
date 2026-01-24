
import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import forecastReducer, { setMapView, setActiveProbability } from '../../store/forecastSlice';
import { GeoJSON } from 'leaflet';

// Import component AFTER mocks
import ForecastMap from './ForecastMap';
// Use import for types
import { FeatureGroup } from 'react-leaflet';
import Legend from './Legend';

// Mocks must be defined before imports
jest.mock('leaflet', () => {
  return {
    icon: jest.fn(),
    Marker: {
      prototype: {
        options: {}
      }
    },
    Map: class {
        on() { /* mock */ }
        off() { /* mock */ }
        removeLayer() { /* mock */ }
        getCenter() { return { lat: 0, lng: 0 }; }
        getZoom() { return 0; }
    },
    LeafletEvent: class {},
  };
});

jest.mock('@geoman-io/leaflet-geoman-free', () => ({}));
jest.mock('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css', () => ({}));
jest.mock('leaflet/dist/leaflet.css', () => ({}));

// Mock Legend
jest.mock('./Legend', () => {
    // skipcq: JS-C1003
    const React = require('react');
    return {
        __esModule: true,
        default: jest.fn(() => <div>Legend</div>)
    };
});

// Mock react-leaflet
const mockMapInstance = {
    on: jest.fn(),
    off: jest.fn(),
    getCenter: () => ({ lat: 0, lng: 0 }),
    getZoom: () => 0,
    pm: {
        addControls: jest.fn(),
        setGlobalOptions: jest.fn(),
    }
};

jest.mock('react-leaflet', () => {
  // skipcq: JS-C1003
  const React = require('react');
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
    TileLayer: () => <div data-testid="tile-layer">TileLayer</div>,
    FeatureGroup: jest.fn(({ children }: { children: React.ReactNode }) => <div data-testid="feature-group">{children}</div>),
    GeoJSON: jest.fn(() => <div data-testid="geojson">GeoJSON</div>),
    useMap: () => mockMapInstance,
  };
});

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'test-uuid'
}));

describe('ForecastMap Performance', () => {
  let store: EnhancedStore;

  // Cast mocks to Jest mock types
  const MockFeatureGroup = FeatureGroup as unknown as jest.Mock;
  const MockLegend = Legend as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    store = configureStore({
      reducer: {
        forecast: forecastReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });
  });

  it('does NOT re-render OutlookLayers (FeatureGroups) when map view changes', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {
        outlookType: 'tornado',
        probability: '5%',
        isSignificant: false,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
      },
      id: 'test-feature'
    };

    store.dispatch({
      type: 'forecast/addFeature',
      payload: { feature }
    });

    render(
      <Provider store={store}>
        <ForecastMap />
      </Provider>
    );

    const initialRenderCount = MockFeatureGroup.mock.calls.length;

    // NOTE: If initialRenderCount > 1, it might mean we still have some re-renders on mount,
    // but as long as it stabilizes, we are good.
    // 1 render expected.

    act(() => {
      store.dispatch(setMapView({ center: [40, -100], zoom: 5 }));
    });

    const afterMapMoveCount = MockFeatureGroup.mock.calls.length;

    // Expect failure currently
    expect(afterMapMoveCount).toBe(initialRenderCount);
  });

  it('does NOT re-render Legend when drawing state changes unrelated to active type', () => {
      render(
        <Provider store={store}>
          <ForecastMap />
        </Provider>
      );

      const initialLegendCount = MockLegend.mock.calls.length;

      act(() => {
          store.dispatch(setActiveProbability('10%'));
      });

      const afterChangeCount = MockLegend.mock.calls.length;

      expect(afterChangeCount).toBe(initialLegendCount);
  });
});
