/**
 * Unit tests for helper functions in OpenLayersVerificationMap
 * Focus on pure utilities to raise coverage without instantiating a full OL Map.
 */

import { jest } from '@jest/globals';

// Mock ol-mapbox-style to avoid loading ESM modules in tests
jest.mock('ol-mapbox-style', () => ({ apply: jest.fn() }));

// Mock mapStyleUtils used by buildStyle/getVerificationStyleZIndex
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

import * as mod from './OpenLayersVerificationMap';

describe('OpenLayersVerificationMap helpers', () => {
  let originalCreateElement: typeof document.createElement;

  beforeAll(() => {
    originalCreateElement = document.createElement;
  });

  afterAll(() => {
    document.createElement = originalCreateElement;
  });

  test('toRgbaColor handles empty, hex (3/6), rgb/rgba and invalid values', () => {
    expect(mod.toRgbaColor({ color: '', alpha: 0.5 })).toBe('rgba(255,255,255,0.5)');
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

    const pattern = mod.createHatchPattern('CIG1');
    expect(pattern).toBeTruthy();
  });

  test('isFunctionColorNotation and coerceNumber behave correctly', () => {
    expect(mod.isFunctionColorNotation('rgba(1,2,3,0.4)')).toBe(true);
    expect(mod.isFunctionColorNotation('#123')).toBe(false);
    expect(mod.coerceNumber(5, 2)).toBe(5);
    expect(mod.coerceNumber('a' as unknown as number, 2)).toBe(2);
  });

  test('resolveFill/Stroke opacity and width defaults', () => {
    expect(mod.resolveFillOpacity('categorical', 0.6)).toBe(0.6);
    expect(mod.resolveFillOpacity('categorical', 'x' as unknown)).toBe(0.25);
    expect(mod.resolveStrokeOpacity(0.7)).toBe(0.7);
    expect(mod.resolveStrokeOpacity('y' as unknown)).toBe(1);
    expect(mod.resolveStrokeWidth(4)).toBe(4);
    expect(mod.resolveStrokeWidth('z' as unknown)).toBe(2);
  });

  test('isCigProbability and getVerificationStyleZIndex', () => {
    expect(mod.isCigProbability('CIG1')).toBe(true);
    expect(mod.isCigProbability('P10')).toBe(false);
    // Non-CIG uses computeZIndex mock (42)
    expect(mod.getVerificationStyleZIndex({ outlookType: 'categorical' as any, probability: 'P10' })).toBe(42);
    // CIG returns 1000 + rank
    expect(mod.getVerificationStyleZIndex({ outlookType: 'categorical' as any, probability: 'CIG3' })).toBe(1003);
  });

  test('buildCigStyleParts returns fill and stroke', () => {
    // Stub canvas for pattern
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

    const parts = mod.buildCigStyleParts('CIG2');
    expect(parts.fill).toBeTruthy();
    expect(parts.stroke).toBeTruthy();
  });

  test('createStandardFill/createStandardStroke return style objects', () => {
    const f = mod.createStandardFill({ color: '#123456', alpha: 0.5 });
    const s = mod.createStandardStroke({ color: '#abcdef', opacity: 0.6, width: 3 });
    expect(f).toBeTruthy();
    expect(s).toBeTruthy();
  });

  test('buildStyle returns an OpenLayers Style object for CIG and non-CIG', () => {
    const s1 = mod.buildStyle({ outlookType: 'categorical' as any, probability: 'P10' });
    expect(s1).toBeTruthy();
    // For CIG probability
    // Stub canvas for pattern used by CIG branch
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

    const s2 = mod.buildStyle({ outlookType: 'categorical' as any, probability: 'CIG1' });
    expect(s2).toBeTruthy();
  });

  test('replaceLayerGroupLayers copies layers from source to target via layer containers', () => {
    const pushed: any[] = [];
    const target = { getLayers: () => ({ clear: () => (pushed.length = 0), push: (l: any) => pushed.push(l) }) };
    const source = { getLayers: () => ({ getArray: () => ['a', 'b'] }) };
    mod.replaceLayerGroupLayers(target as any, source as any);
    expect(pushed).toEqual(['a', 'b']);
  });

  test('createVerifTileSource returns a source for known styles', () => {
    const s = mod.createVerifTileSource('osm');
    expect(s).toBeTruthy();
  });
});
