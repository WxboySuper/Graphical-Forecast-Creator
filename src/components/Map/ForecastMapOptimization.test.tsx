
import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import forecastReducer, { addFeature } from '../../store/forecastSlice';
import { GeoJSON } from 'leaflet';
import ForecastMap from './ForecastMap';

// Mocks
jest.mock('leaflet', () => {
  return {
    icon: jest.fn(),
    Marker: {
      prototype: {
        options: {}
      }
    },
    Map: class {
        // skipcq: JS-0105
        on() { return this; }
        // skipcq: JS-0105
        off() { return this; }
        // skipcq: JS-0105
        removeLayer() { return this; }
        // skipcq: JS-0105
        getCenter() { return { lat: 0, lng: 0 }; }
        // skipcq: JS-0105
        getZoom() { return 0; }
    },
    LeafletEvent: class {
        // skipcq: JS-0323
        target: any;
        // skipcq: JS-0323
        constructor() { this.target = {}; }
    },
  };
});

jest.mock('@geoman-io/leaflet-geoman-free', () => ({}));
jest.mock('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css', () => ({}));
jest.mock('leaflet/dist/leaflet.css', () => ({}));

jest.mock('./Legend', () => {
    // skipcq: JS-0359
    const React = require('react');
    return {
        __esModule: true,
        default: jest.fn(() => React.createElement('div', null, 'Legend'))
    };
});

const mockMapInstance = {
    on: jest.fn(),
    off: jest.fn(),
    getCenter: () => ({ lat: 0, lng: 0 }),
    getZoom: () => 0,
    pm: {
        addControls: jest.fn(),
        setGlobalOptions: jest.fn(),
        globalDrawModeEnabled: jest.fn(() => false),
    }
};

jest.mock('react-leaflet', () => {
  // skipcq: JS-0359
  const React = require('react');
  const LayersControl = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  LayersControl.BaseLayer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  LayersControl.Overlay = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

  return {
    MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
    TileLayer: () => <div data-testid="tile-layer">TileLayer</div>,
    FeatureGroup: ({ children }: { children: React.ReactNode }) => <div data-testid="feature-group">{children}</div>,
    GeoJSON: jest.fn(() => <div data-testid="geojson">GeoJSON</div>),
    useMap: () => mockMapInstance,
    LayersControl: LayersControl,
  };
});

jest.mock('uuid', () => ({
  v4: () => 'test-uuid'
}));

describe('ForecastMap Optimization', () => {
  let store: EnhancedStore;

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

  it('does NOT re-render existing features when a new feature is added', () => {
    const feature1: GeoJSON.Feature = {
        type: 'Feature',
        properties: { outlookType: 'tornado', probability: '5%', isSignificant: false },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
        id: 'feat-1'
    };
    const feature2: GeoJSON.Feature = {
        type: 'Feature',
        properties: { outlookType: 'tornado', probability: '5%', isSignificant: false },
        geometry: { type: 'Polygon', coordinates: [[[2, 2], [2, 3], [3, 3], [3, 2], [2, 2]]] },
        id: 'feat-2'
    };

    // Initial state: 1 feature
    store.dispatch(addFeature({ feature: feature1 }));

    render(
        <Provider store={store}>
            <ForecastMap />
        </Provider>
    );

    const MockGeoJSON = require('react-leaflet').GeoJSON as jest.Mock;

    // Initial render should have called GeoJSON once
    expect(MockGeoJSON).toHaveBeenCalledTimes(1);

    // Reset calls
    MockGeoJSON.mockClear();

    // Add second feature
    act(() => {
        store.dispatch(addFeature({ feature: feature2 }));
    });

    // Check calls
    // Without optimization: Feature 1 re-renders + Feature 2 renders = 2 calls
    // With optimization: Feature 1 skips re-render + Feature 2 renders = 1 call
    expect(MockGeoJSON).toHaveBeenCalledTimes(1);
  });
});
