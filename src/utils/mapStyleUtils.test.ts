import { sortProbabilities, getFeatureStyle } from './mapStyleUtils';

describe('mapStyleUtils', () => {
  test('sortProbabilities ordering', () => {
    const entries: Array<[string, unknown[]]> = [['30%', []], ['TSTM', []], ['CIG1', []], ['5%', []]];
    const sorted = sortProbabilities(entries);
    expect(sorted.map(([probability]) => probability)).toEqual(['TSTM', '5%', '30%', 'CIG1']);
  });

  test('getFeatureStyle returns hatching for CIG', () => {
    const style = getFeatureStyle('tornado', 'CIG1');
    expect(style.className).toBe('hatching-layer');
    expect(style.fillColor).toContain('pattern');
  });

  test('getFeatureStyle returns color fill for numeric', () => {
    const style = getFeatureStyle('categorical', 'TSTM');
    expect(style.fillColor).toBeDefined();
  });
});
