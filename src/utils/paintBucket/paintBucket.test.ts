import type { Feature, Polygon } from 'geojson';
import {
  applyPaintBucketStrategy,
  resolveTargetProbability,
} from './applyPaintBucketStrategy';

const square = (id: string, probability: string, minX: number, minY: number, size: number): Feature<Polygon> => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [minX, minY],
      [minX + size, minY],
      [minX + size, minY + size],
      [minX, minY + size],
      [minX, minY],
    ]],
  },
  properties: {
    outlookType: 'tornado',
    probability,
  },
});

const buildMap = (entries: Array<[string, Feature[]]>) => new Map(entries);

describe('resolveTargetProbability', () => {
  const list = ['2%', '5%', '10%', '15%'] as const;

  test('recategorize uses the active probability', () => {
    expect(resolveTargetProbability('recategorize', '5%', '15%', list)).toBe('15%');
    expect(resolveTargetProbability('recategorize', '15%', '15%', list)).toBeNull();
  });

  test('step up and down move one slot', () => {
    expect(resolveTargetProbability('step-up', '5%', '2%', list)).toBe('10%');
    expect(resolveTargetProbability('step-down', '10%', '2%', list)).toBe('5%');
    expect(resolveTargetProbability('step-up', '15%', '2%', list)).toBeNull();
    expect(resolveTargetProbability('step-down', '2%', '2%', list)).toBeNull();
  });
});

describe('applyPaintBucketStrategy', () => {
  const probabilityList = ['2%', '5%', '10%', '15%'] as const;

  test('recategorize moves a feature between keys', () => {
    const feature = square('a', '5%', 0, 0, 1);
    const map = buildMap([['5%', [feature]]]);

    const result = applyPaintBucketStrategy(map, {
      outlookType: 'tornado',
      featureId: 'a',
      fromProbability: '5%',
      strategy: 'recategorize',
      activeProbability: '15%',
      probabilityList,
    });

    expect(result.changed).toBe(true);
    expect(result.targetProbability).toBe('15%');
    expect(result.map.get('5%')).toBeUndefined();
    expect(result.map.get('15%')?.[0].properties?.probability).toBe('15%');
  });

  test('step-up promotes without changing the active brush', () => {
    const feature = square('a', '10%', 0, 0, 1);
    const map = buildMap([['10%', [feature]]]);

    const result = applyPaintBucketStrategy(map, {
      outlookType: 'tornado',
      featureId: 'a',
      fromProbability: '10%',
      strategy: 'step-up',
      activeProbability: '2%',
      probabilityList,
    });

    expect(result.map.get('15%')).toHaveLength(1);
    expect(result.map.get('10%')).toBeUndefined();
  });

  test('subtract-overlap clips overlapping lower-risk geometry', () => {
    const lower = square('lower', '5%', 0, 0, 2);
    const upper = square('upper', '10%', 0.5, 0.5, 1);
    const map = buildMap([
      ['5%', [lower]],
      ['10%', [upper]],
    ]);

    const result = applyPaintBucketStrategy(map, {
      outlookType: 'tornado',
      featureId: 'upper',
      fromProbability: '10%',
      strategy: 'subtract-overlap',
      activeProbability: '15%',
      probabilityList,
    });

    expect(result.map.get('15%')).toHaveLength(1);
    expect(result.map.get('10%')).toBeUndefined();

    const remainingLower = result.map.get('5%')?.[0];
    expect(remainingLower).toBeDefined();
    expect(remainingLower?.geometry.type).toBe('Polygon');
  });

  test('returns unchanged map when target equals source', () => {
    const feature = square('a', '10%', 0, 0, 1);
    const map = buildMap([['10%', [feature]]]);

    const result = applyPaintBucketStrategy(map, {
      outlookType: 'tornado',
      featureId: 'a',
      fromProbability: '10%',
      strategy: 'recategorize',
      activeProbability: '10%',
      probabilityList,
    });

    expect(result.changed).toBe(false);
    expect(result.map).toBe(map);
  });
});
