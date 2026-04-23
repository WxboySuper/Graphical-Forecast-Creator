import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import forecastReducer from '../../store/forecastSlice';
import overlaysReducer, { setBaseMapStyle } from '../../store/overlaysSlice';
import verificationReducer, { loadVerificationForecast } from '../../store/verificationSlice';
import stormReportsReducer from '../../store/stormReportsSlice';
import type { ForecastCycle, OutlookDay } from '../../types/outlooks';

class MockFeature {
  private props: Record<string, unknown>;

  constructor(props: Record<string, unknown> = {}) {
    this.props = { ...props };
  }

  setStyle(_style: unknown) {}

  set(key: string, value: unknown) {
    this.props[key] = value;
  }

  get(key: string) {
    return this.props[key];
  }
}

class MockVectorSource {
  private features: MockFeature[] = [];

  addFeature(feature: MockFeature) {
    this.features.push(feature);
  }

  addFeatures(features: MockFeature[]) {
    this.features.push(...features);
  }

  clear() {
    this.features = [];
  }

  getFeatures() {
    return this.features;
  }
}

class MockLayer {
  constructor(_opts: Record<string, unknown> = {}) {}
  setVisible(_value: boolean) {}
  setSource(_value: unknown) {}
  setOpacity(_value: number) {}
}

class MockLayerGroup extends MockLayer {
  private layers: unknown[] = [];

  getLayers() {
    return {
      clear: () => {
        this.layers = [];
      },
      push: (layer: unknown) => {
        this.layers.push(layer);
      },
      getArray: () => this.layers,
    };
  }
}

class MockView {
  private center: [number, number];
  private zoom: number;

  constructor(opts: Record<string, unknown> = {}) {
    this.center = (opts.center as [number, number]) ?? [0, 0];
    this.zoom = (opts.zoom as number) ?? 4;
  }

  getCenter() {
    return this.center;
  }

  setCenter(value: [number, number]) {
    this.center = value;
  }

  getZoom() {
    return this.zoom;
  }

  setZoom(value: number) {
    this.zoom = value;
  }
}

class MockMap {
  private view: MockView;

  constructor(opts: Record<string, unknown>) {
    this.view = opts.view as MockView;
  }

  getView() {
    return this.view;
  }

  setTarget() {}
}

class MockGeoJSON {
  readFeatures() {
    return [new MockFeature()];
  }

  readFeature(feature: Record<string, unknown>) {
    return new MockFeature({ ...(feature.properties as Record<string, unknown>) });
  }
}

jest.mock('ol/Map', () => ({
  __esModule: true,
  default: MockMap,
}));
jest.mock('ol/View', () => ({
  __esModule: true,
  default: MockView,
}));
jest.mock('ol/layer/Group', () => ({
  __esModule: true,
  default: MockLayerGroup,
}));
jest.mock('ol/layer/Tile', () => ({
  __esModule: true,
  default: MockLayer,
}));
jest.mock('ol/layer/Vector', () => ({
  __esModule: true,
  default: MockLayer,
}));
jest.mock('ol/source/Vector', () => ({
  __esModule: true,
  default: MockVectorSource,
}));
jest.mock('ol/source/OSM', () => ({
  __esModule: true,
  default: class MockOSM {},
}));
jest.mock('ol/source/XYZ', () => ({
  __esModule: true,
  default: class MockXYZ {},
}));
jest.mock('ol/format/GeoJSON', () => ({
  __esModule: true,
  default: MockGeoJSON,
}));
jest.mock('ol/proj', () => ({
  fromLonLat: (coords: [number, number]) => coords,
}));
jest.mock('ol/Feature', () => ({
  __esModule: true,
  default: class Feature extends MockFeature {},
}));
jest.mock('ol/geom/Point', () => ({
  __esModule: true,
  default: class Point {
    constructor(_coords: unknown) {}
  },
}));
jest.mock('ol/style', () => ({
  Circle: class Circle {
    constructor(_opts?: unknown) {}
  },
  Fill: class Fill {
    constructor(_opts?: unknown) {}
  },
  Stroke: class Stroke {
    constructor(_opts?: unknown) {}
  },
  Style: class Style {
    constructor(_opts?: unknown) {}
  },
}));
jest.mock('ol-mapbox-style', () => ({
  apply: jest.fn(() => Promise.resolve()),
}));
jest.mock('./Legend', () => (props: Record<string, unknown>) => (
  <div data-testid="legend">Legend {String(props.activeOutlookType)}</div>
));
jest.mock('./UnofficialBadge', () => () => <div data-testid="unofficial-badge">Badge</div>);
jest.mock('../../lib/openFreeMap', () => ({
  isOpenFreeMapStyle: () => false,
  getOpenFreeMapStyleSet: jest.fn(),
}));

import OpenLayersVerificationMap from './OpenLayersVerificationMap';

describe('OpenLayersVerificationMap component', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    } as Response);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders map controls and responds to base map style selection', () => {
    const store = configureStore({
      reducer: {
        forecast: forecastReducer,
        overlays: overlaysReducer,
        verification: verificationReducer,
        stormReports: stormReportsReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
          immutableCheck: false,
        }),
    });

    const dayData: OutlookDay = {
      day: 1,
      data: {
        categorical: new Map([
          ['SLGT', [{
            type: 'Feature',
            id: 'cat-1',
            geometry: {
              type: 'Polygon',
              coordinates: [[[-100, 40], [-99, 40], [-99, 41], [-100, 41], [-100, 40]]],
            },
            properties: { outlookType: 'categorical', probability: 'SLGT', isSignificant: false },
          }]],
        ]),
      } as OutlookDay['data'],
      metadata: {
        issueDate: '2026-04-22',
        validDate: '2026-04-22',
        issuanceTime: '1200Z',
        createdAt: '2026-04-22T00:00:00.000Z',
        lastModified: '2026-04-22T00:00:00.000Z',
      },
    };

    const verificationForecast: ForecastCycle = {
      days: { 1: dayData },
      currentDay: 1,
      cycleDate: '2026-04-22',
    };

    act(() => {
      store.dispatch(loadVerificationForecast(verificationForecast));
      store.dispatch(setBaseMapStyle('blank'));
    });

    render(
      <Provider store={store}>
        <OpenLayersVerificationMap activeOutlookType="categorical" selectedDay={1} />
      </Provider>
    );

    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toHaveTextContent('categorical');

    fireEvent.click(screen.getByText('Map'));
    expect(screen.getByText('OpenStreetMap')).toBeInTheDocument();
    fireEvent.click(screen.getByText('OpenStreetMap'));

    act(() => {
      store.dispatch(setBaseMapStyle('osm'));
    });
  });
});
