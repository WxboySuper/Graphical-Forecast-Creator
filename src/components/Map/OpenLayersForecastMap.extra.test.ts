/**
 * Additional unit tests for OpenLayersForecastMap helpers that are safe to run
 * without instantiating a full OpenLayers Map instance.
 */

import { jest } from '@jest/globals';

// Mock ol-mapbox-style to avoid ESM modules during tests
jest.mock('ol-mapbox-style', () => ({ apply: jest.fn() }));

// Mock GeoJSON format so readFeatures returns predictable results when ensureBlankLayerLoaded constructs a GeoJSON instance
jest.mock('ol/format/GeoJSON', () => {
  return jest.fn().mockImplementation(() => ({
    readFeatures: jest.fn(() => [{ fake: 'feature-a' }]),
  }));
});

import * as mod from './OpenLayersForecastMap';

type OverlayStub = {
  setPosition: (position: unknown) => void;
};

type BlankLayerConfigStub = {
  source: { addFeatures: (features: unknown[]) => void };
  isLoaded: () => boolean;
  url: string;
  getCache: () => unknown | null;
  setCache: (data: object) => void;
  style?: unknown;
};

describe('OpenLayersForecastMap additional helpers', () => {
  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('createLabelOverlaySource returns a source for known styles and null for unknown', () => {
    const s1 = mod.createLabelOverlaySource('osm');
    expect(s1).toBeTruthy();

    const s2 = mod.createLabelOverlaySource('carto-dark');
    expect(s2).toBeTruthy();

    const s3 = mod.createLabelOverlaySource('esri-satellite');
    expect(s3).toBeTruthy();

    expect(mod.createLabelOverlaySource('nonexistent' as never)).toBeNull();
  });

  test('createTileSource returns a tile source for known styles', () => {
    const t1 = mod.createTileSource('osm');
    expect(t1).toBeTruthy();

    const t2 = mod.createTileSource('esri-satellite');
    expect(t2).toBeTruthy();
  });

  test('hideOverlay clears overlay position', () => {
    const overlay: OverlayStub = { setPosition: jest.fn() };
    mod.hideOverlay(overlay as never);
    expect(overlay.setPosition).toHaveBeenCalledWith(undefined);
  });

  test('ensureBlankLayerLoaded returns early when already loaded', async () => {
    global.fetch = jest.fn();

    const config: BlankLayerConfigStub = {
      source: { addFeatures: jest.fn() },
      isLoaded: () => true,
      url: 'https://example.com/geo.json',
      getCache: () => null,
      setCache: jest.fn(),
      style: undefined,
    };

    await mod.ensureBlankLayerLoaded(config);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(config.source.addFeatures).not.toHaveBeenCalled();
  });

  test('ensureBlankLayerLoaded fetches, caches and adds features when not loaded', async () => {
    const fakeGeo = { type: 'FeatureCollection', features: [] };
    global.fetch = jest.fn().mockResolvedValue({ json: async () => fakeGeo });

    const added: unknown[] = [];
    const config: BlankLayerConfigStub = {
      source: { addFeatures: (features: unknown[]) => { added.push(...features); } },
      isLoaded: () => false,
      url: 'https://example.com/geo.json',
      getCache: () => null,
      setCache: jest.fn(),
      style: { /* style placeholder */ },
    };

    const spyApply = jest.spyOn(mod, 'applyBlankLayerStyle');
    await mod.ensureBlankLayerLoaded(config);
    expect(config.setCache).toHaveBeenCalled();
    // our mocked GeoJSON.readFeatures returns an array with one element
    expect(added.length).toBeGreaterThanOrEqual(1);
    expect(spyApply).toHaveBeenCalled();
    spyApply.mockRestore();
  });
});
