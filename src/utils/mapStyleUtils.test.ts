import { sortProbabilities, getFeatureStyle } from './mapStyleUtils';

describe('mapStyleUtils', () => {
  test('sortProbabilities ordering', () => {
    const entries = [['30%', []], ['TSTM', []], ['CIG1', []], ['5%', []]] as any;
    const sorted = sortProbabilities(entries);
    expect(sorted.map((e: any) => e[0])).toEqual(['TSTM', '5%', '30%', 'CIG1']);
  });

  test('getFeatureStyle returns hatching for CIG', () => {
    const s = getFeatureStyle('tornado' as any, 'CIG1');
    expect(s.className).toBe('hatching-layer');
    expect(s.fillColor).toContain('pattern');
  });

  test('getFeatureStyle returns color fill for numeric', () => {
    const s = getFeatureStyle('categorical' as any, 'TSTM');
    expect(s.fillColor).toBeDefined();
  });
});
