import { processOutlooksToCategorical } from '../useAutoCategorical';
import { OutlookData } from '../../types/outlooks';

const makeFeature = (id: string) => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
  properties: {}
} as unknown as GeoJSON.Feature);

describe('processOutlooksToCategorical', () => {
  test('returns empty map for empty outlooks', () => {
    const outlooks: OutlookData = {
      tornado: new Map(),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map()
    };

    const result = processOutlooksToCategorical(outlooks);
    expect(result.size).toBe(0);
  });

  test('converts single tornado probability to categorical feature', () => {
    const feature = makeFeature('t1');
    const outlooks: OutlookData = {
      tornado: new Map([['30%', [feature]]]),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map()
    };

    const result = processOutlooksToCategorical(outlooks);
    expect(result.size).toBe(1);
    const entry = Array.from(result.values())[0];
    const props = entry.feature.properties as unknown as { outlookType?: string; probability?: string; derivedFrom?: string };
    expect(props.outlookType).toBe('categorical');
    expect(props.probability).toBe('MDT');
    expect(props.derivedFrom).toBe('tornado');
    expect(entry.sources).toEqual([{ type: 'tornado', probability: '30%' }]);
  });

  test('merges sources when same feature has equal highest risk across types', () => {
    const f1 = makeFeature('o1');
    const f2 = makeFeature('o1'); // same id to simulate overlap

    const outlooks: OutlookData = {
      tornado: new Map([['30%', [f1]]]), // tornado -> MDT
      wind: new Map([['45#', [f2]]]),    // wind -> MDT (same as tornado in risk ordering)
      hail: new Map(),
      categorical: new Map()
    };

    const result = processOutlooksToCategorical(outlooks);
    expect(result.size).toBe(1);
    const value = Array.from(result.values())[0];
    expect(value.risk).toBe('MDT');
    // sources should contain both tornado and wind
    const types = value.sources.map(s => s.type).sort();
    expect(types).toEqual(['tornado', 'wind']);
  });

  test('skips TSTM risk levels (unknown/0% inputs)', () => {
    const feature = makeFeature('skip1');
    const outlooks: OutlookData = {
      tornado: new Map([['0%', [feature]]]), // maps to TSTM via default
      wind: new Map(),
      hail: new Map(),
      categorical: new Map()
    };

    const result = processOutlooksToCategorical(outlooks);
    expect(result.size).toBe(0);
  });
});
