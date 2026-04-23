import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import forecastReducer, { addFeature } from '../../store/forecastSlice';
import overlaysReducer, { setBaseMapStyle, setGhostOutlookVisibility } from '../../store/overlaysSlice';

const mapInstances: Array<Record<string, unknown>> = [];

class MockFeature {
  private props: Record<string, unknown>;
  private styleValue: unknown;

  constructor(props: Record<string, unknown> = {}) {
    this.props = { ...props };
  }

  setStyle(style: unknown) {
    this.styleValue = style;
  }

  getStyle() {
    return this.styleValue;
  }

  set(key: string, value: unknown) {
    this.props[key] = value;
  }

  get(key: string) {
    return this.props[key];
  }

  getGeometry() {
    return { type: 'Polygon', coordinates: [] };
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
  public visible = true;
  public source: unknown;
  public opacity = 1;

  constructor(opts: Record<string, unknown> = {}) {
    this.source = opts.source;
  }

  setVisible(value: boolean) {
    this.visible = value;
  }

  setSource(value: unknown) {
    this.source = value;
  }

  setOpacity(value: number) {
    this.opacity = value;
  }
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

class MockInteraction {
  private handlers: Record<string, (event: unknown) => void> = {};

  on(event: string, handler: (event: unknown) => void) {
    this.handlers[event] = handler;
  }

  setActive(_value: boolean) {}

  getFeatures() {
    return { clear: () => undefined };
  }
}

class MockMap {
  private handlers: Record<string, (event: unknown) => void> = {};
  private view: MockView;

  constructor(opts: Record<string, unknown>) {
    this.view = opts.view as MockView;
    mapInstances.push(this as unknown as Record<string, unknown>);
  }

  on(event: string, handler: (event: unknown) => void) {
    this.handlers[event] = handler;
  }

  getView() {
    return this.view;
  }

  addOverlay(_overlay: unknown) {}

  addInteraction(_interaction: unknown) {}

  removeInteraction(_interaction: unknown) {}

  forEachFeatureAtPixel() {
    return null;
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

  writeGeometryObject() {
    return { type: 'Polygon', coordinates: [] };
  }
}

class MockOverlay {
  setPosition(_position: unknown) {}
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
jest.mock('ol/interaction', () => ({
  Draw: MockInteraction,
  Modify: MockInteraction,
  Select: MockInteraction,
  Snap: MockInteraction,
}));
jest.mock('ol/style', () => ({
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
jest.mock('ol/proj', () => ({
  fromLonLat: (coords: [number, number]) => coords,
  toLonLat: (coords: [number, number]) => coords,
}));
jest.mock('ol/Overlay', () => ({
  __esModule: true,
  default: MockOverlay,
}));
jest.mock('ol/events/condition', () => ({
  click: 'click',
}));
jest.mock('ol-mapbox-style', () => ({
  apply: jest.fn(() => Promise.resolve()),
}));
jest.mock('./Legend', () => () => <div data-testid="legend">Legend</div>);
jest.mock('./StatusOverlay', () => () => <div data-testid="status-overlay">Status</div>);
jest.mock('./UnofficialBadge', () => () => <div data-testid="unofficial-badge">Badge</div>);
jest.mock('../../lib/openFreeMap', () => ({
  isOpenFreeMapStyle: () => false,
  getOpenFreeMapStyleSet: jest.fn(),
}));

import OpenLayersForecastMap from './OpenLayersForecastMap';

describe('OpenLayersForecastMap component', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mapInstances.length = 0;
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    } as Response);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders and handles map mode + basemap changes without crashing', () => {
    const store = configureStore({
      reducer: {
        forecast: forecastReducer,
        overlays: overlaysReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
          immutableCheck: false,
        }),
    });

    act(() => {
      store.dispatch(
        addFeature({
          feature: {
            type: 'Feature',
            id: 'cat-1',
            geometry: {
              type: 'Polygon',
              coordinates: [[[-100, 40], [-99, 40], [-99, 41], [-100, 41], [-100, 40]]],
            },
            properties: {
              outlookType: 'categorical',
              probability: 'SLGT',
              isSignificant: false,
            },
          },
        })
      );
      store.dispatch(
        addFeature({
          feature: {
            type: 'Feature',
            id: 'tor-1',
            geometry: {
              type: 'Polygon',
              coordinates: [[[-101, 39], [-100, 39], [-100, 40], [-101, 40], [-101, 39]]],
            },
            properties: {
              outlookType: 'tornado',
              probability: '10%',
              isSignificant: false,
            },
          },
        })
      );
      store.dispatch(setGhostOutlookVisibility({ outlookType: 'tornado', visible: true }));
    });

    render(
      <Provider store={store}>
        <OpenLayersForecastMap />
      </Provider>
    );

    expect(screen.getByText('Pan')).toBeInTheDocument();
    expect(screen.getByText('Draw')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Draw'));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Pan'));

    act(() => {
      store.dispatch(setBaseMapStyle('blank'));
      store.dispatch(setBaseMapStyle('osm'));
    });

    expect(mapInstances.length).toBeGreaterThan(0);
  });
});
