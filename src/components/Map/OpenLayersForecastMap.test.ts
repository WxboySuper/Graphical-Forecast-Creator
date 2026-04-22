/**
 * Unit tests for helper functions in OpenLayersForecastMap
 * Focuses on pure utilities to raise coverage without instantiating a full OL Map.
 */

import { jest } from '@jest/globals';

// Mock ol-mapbox-style (pulls pbf; avoid loading ESM module in Jest)
jest.mock('ol-mapbox-style', () => ({ apply: jest.fn() }));

// Mock mapStyleUtils used by toOlStyle/toGhostOlStyle
jest.mock('../../utils/mapStyleUtils', () => ({
  getFeatureStyle: jest.fn(() => ({
    fillColor: '#112233',
    fillOpacity: 0.5,
    opacity: 0.9,
    color: '#445566',
    weight: 4,
  })),
  computeZIndex: jest.fn(() => 42),
}));

import * as mod from './OpenLayersForecastMap';

describe('OpenLayersForecastMap helpers', () => {
  let originalCreateElement: typeof document.createElement;

  beforeAll(() => {
    originalCreateElement = document.createElement;
  });

  afterAll(() => {
    document.createElement = originalCreateElement;
  });

  test('toRgbaColor handles empty, hex (3/6), rgb/rgba and invalid values', () => {
    expect(mod.toRgbaColor({ color: '', alpha: 0.5 })).toBe('rgba(255, 255, 255, 0.5)');
    expect(mod.toRgbaColor({ color: 'rgba(1,2,3,0.4)', alpha: 0.4 })).toBe('rgba(1,2,3,0.4)');
    expect(mod.toRgbaColor({ color: 'rgb(4,5,6)', alpha: 0.8 })).toBe('rgb(4,5,6)');
    expect(mod.toRgbaColor({ color: '#fff', alpha: 0.3 })).toBe('rgba(255, 255, 255, 0.3)');
    expect(mod.toRgbaColor({ color: '#12ab34', alpha: 1 })).toBe('rgba(18, 171, 52, 1)');
    // Invalid hex should return original
    expect(mod.toRgbaColor({ color: '#zzz', alpha: 0.2 })).toBe('#zzz');
  });

  test('createHatchPattern returns a pattern when canvas context exists', () => {
    // Stub document.createElement('canvas') to provide a 2D context with createPattern
    document.createElement = ((tag: string) => {
      if (tag === 'canvas') {
        const canvas: any = { width: 10, height: 10 };
        canvas.getContext = () => ({
          strokeStyle: '',
          lineWidth: 0,
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          createPattern: () => 'pattern-object',
        });
        return canvas as unknown as HTMLElement;
      }
      return originalCreateElement.call(document, tag);
    }) as typeof document.createElement;

    const pattern = mod.createHatchPattern({ cigLevel: 'CIG1' });
    expect(pattern).toBeTruthy();
  });

  test('resolveFillOpacity returns numeric or fallback', () => {
    expect(mod.resolveFillOpacity({ fillOpacity: 0.6 })).toBe(0.6);
    // non-number falls back
    expect(mod.resolveFillOpacity({ fillOpacity: 'abc' as unknown })).toBe(0.25);
  });

  test('createOutlookFill returns Fill for non-CIG and pattern or transparent fallback for CIG', () => {
    // Non-CIG should create a Fill (object)
    const f1 = mod.createOutlookFill({ probability: 'P10', fillColor: '#123456', fillOpacity: 0.5 });
    expect(f1).toBeTruthy();

    // For CIG, stub canvas like earlier
    document.createElement = ((tag: string) => {
      if (tag === 'canvas') {
        const canvas: any = { width: 10, height: 10 };
        canvas.getContext = () => ({
          strokeStyle: '',
          lineWidth: 0,
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          createPattern: () => 'pattern-object',
        });
        return canvas as unknown as HTMLElement;
      }
      return originalCreateElement.call(document, tag);
    }) as typeof document.createElement;

    const f2 = mod.createOutlookFill({ probability: 'CIG1', fillColor: '#000000', fillOpacity: 0.5 });
    expect(f2).toBeTruthy();
  });

  test('resolveStrokeWidth returns 3 for top layer, numeric weight otherwise, and default 2', () => {
    expect(mod.resolveStrokeWidth({ weight: 5, isTopLayer: false })).toBe(5);
    expect(mod.resolveStrokeWidth({ weight: 'a' as unknown as number, isTopLayer: false })).toBe(2);
    expect(mod.resolveStrokeWidth({ weight: 1, isTopLayer: true })).toBe(3);
  });

  test('getFeatureIdentity returns null when missing parts and otherwise returns identity', () => {
    const okFeature: any = { get: (k: string) => ({ featureId: 'f1', outlookType: 'categorical', probability: 'P10' } as any)[k] };
    expect(mod.getFeatureIdentity(okFeature)).toEqual({ featureId: 'f1', outlookType: 'categorical', probability: 'P10' });

    const badFeature: any = { get: (k: string) => (k === 'featureId' ? undefined : 'x') };
    expect(mod.getFeatureIdentity(badFeature)).toBeNull();
  });

  test('toUpdatedGeoJsonFeature returns null when identity or geometry missing and otherwise returns geojson feature', () => {
    const featureWithNoId: any = { get: (k: string) => (k === 'featureId' ? undefined : 'x'), getGeometry: () => ({}) };
    const formatStub: any = { writeGeometryObject: jest.fn(() => ({ type: 'Polygon', coordinates: [] })) };
    expect(mod.toUpdatedGeoJsonFeature(featureWithNoId, formatStub, false)).toBeNull();

    const feature: any = {
      get: (k: string) => (k === 'featureId' ? 'id123' : (k === 'outlookType' ? 'categorical' : 'P10')),
      getGeometry: () => ({ some: 'geom' }),
    };

    const result = mod.toUpdatedGeoJsonFeature(feature, formatStub, true);
    expect(result).toBeTruthy();
    expect(result && (result as any).type).toBe('Feature');
    expect((result as any).properties).toHaveProperty('derivedFrom');
  });

  test('applyBlankLayerStyle calls setStyle only when present', () => {
    const called: string[] = [];
    const good: any = { setStyle: (s: any) => called.push('good') };
    const bad: any = { notAStyle: true };
    mod.applyBlankLayerStyle([good, bad], {} as any);
    expect(called).toEqual(['good']);
  });

  test('replaceLayerGroupLayers copies layers from source to target via layer containers', () => {
    const pushed: any[] = [];
    const target = { getLayers: () => ({ clear: () => (pushed.length = 0), push: (l: any) => pushed.push(l) }) };
    const source = { getLayers: () => ({ getArray: () => ['a', 'b'] }) };
    mod.replaceLayerGroupLayers(target as any, source as any);
    expect(pushed).toEqual(['a', 'b']);
  });

  test('isDrawableOutlookType recognizes drawable types', () => {
    expect(mod.isDrawableOutlookType({ outlookType: 'categorical' })).toBe(true);
    expect(mod.isDrawableOutlookType({ outlookType: 'nonexistent' })).toBe(false);
  });

  test('toOlStyle and toGhostOlStyle return style objects', () => {
    const s1 = mod.toOlStyle({ outlookType: 'categorical', probability: 'P10' }, { isTopLayer: false });
    const s2 = mod.toGhostOlStyle({ outlookType: 'categorical', probability: 'P10', isCategorical: true });
    expect(s1).toBeTruthy();
    expect(s2).toBeTruthy();
  });
});
