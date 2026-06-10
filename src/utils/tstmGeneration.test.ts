import { canGenerateTstmForDay, normalizeGeneratedTstmFeatures } from './tstmGeneration';

describe('tstmGeneration utilities', () => {
  test('limits HREF generation to day 1 and day 2', () => {
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
        properties: { source: 'href' },
      },
    ]);

    expect(feature.properties).toMatchObject({
      outlookType: 'categorical',
      probability: 'TSTM',
      isSignificant: false,
      derivedFrom: 'spc-calibrated-thunder',
    });
    expect(feature.id).toBe('generated-tstm-0');
  });
});
