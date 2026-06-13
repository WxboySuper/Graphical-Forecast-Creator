import { canGenerateTstmForDay, normalizeGeneratedTstmFeatures } from './tstmGeneration';

describe('tstmGeneration utilities', () => {
  test('limits SPC calibrated thunder generation to day 1 and day 2', () => {
    expect(canGenerateTstmForDay(1)).toBe(true);
    expect(canGenerateTstmForDay(2)).toBe(true);
    expect(canGenerateTstmForDay(3)).toBe(false);
  });

  test('normalizes generated polygons into editable categorical TSTM features', () => {
    const [feature] = normalizeGeneratedTstmFeatures([
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
        properties: { source: 'spc-href' },
      },
    ]);

    expect(feature.properties).toMatchObject({
      outlookType: 'categorical',
      probability: 'TSTM',
      isSignificant: false,
      derivedFrom: 'spc-href-calibrated-thunder',
    });
    expect(feature.id).toBe('generated-tstm-0');
  });

  test('keeps existing feature ids and accepts multipolygons', () => {
    const [feature] = normalizeGeneratedTstmFeatures([
      {
        type: 'Feature',
        id: 'cached-guidance-1',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
        },
        properties: {},
      },
    ]);

    expect(feature.id).toBe('cached-guidance-1');
    expect(feature.geometry.type).toBe('MultiPolygon');
  });

  test('drops non-polygon guidance instead of placing it in forecast state', () => {
    const features = normalizeGeneratedTstmFeatures([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {},
      },
    ]);

    expect(features).toEqual([]);
  });
});
