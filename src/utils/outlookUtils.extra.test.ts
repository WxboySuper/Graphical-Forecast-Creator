import {
  getOutlookConstraints,
  tornadoToCategorical,
  windToCategorical,
  hailToCategorical,
  totalSevereToCategorical,
  isSignificantThreat,
  getHighestCategoricalRisk,
  getCategoricalRiskDisplayName,
  getOutlookColor,
} from './outlookUtils';

describe('outlookUtils extra', () => {
  test('getOutlookConstraints returns correct sets for days', () => {
    const d1 = getOutlookConstraints(1);
    expect(d1.outlookTypes).toEqual(expect.arrayContaining(['tornado', 'wind', 'hail', 'categorical']));
    const d3 = getOutlookConstraints(3);
    expect(d3.allowedCategorical).not.toContain('HIGH');
    const d8 = getOutlookConstraints(8);
    expect(d8.outlookTypes).toContain('day4-8');
    const d99 = getOutlookConstraints(99);
    expect(d99.outlookTypes).toEqual([]);
  });

  test('tornadoToCategorical maps probabilities properly', () => {
    expect(tornadoToCategorical('2%', 'CIG0')).toBe('MRGL');
    expect(tornadoToCategorical('2%', 'CIG2')).toBe('SLGT');
    expect(tornadoToCategorical('5%', 'CIG0')).toBe('SLGT');
    expect(tornadoToCategorical('5%', 'CIG2')).toBe('ENH');
    expect(tornadoToCategorical('15%', 'CIG2')).toBe('MDT');
    expect(tornadoToCategorical('30%', 'CIG2')).toBe('HIGH');
    expect(tornadoToCategorical('60%', 'CIG1')).toBe('HIGH');
    expect(tornadoToCategorical('1%', 'CIG0')).toBe('TSTM');
  });

  test('windToCategorical maps probabilities properly', () => {
    expect(windToCategorical('5%', 'CIG0')).toBe('MRGL');
    expect(windToCategorical('5%', 'CIG2')).toBe('SLGT');
    expect(windToCategorical('15%', 'CIG0')).toBe('SLGT');
    expect(windToCategorical('15%', 'CIG2')).toBe('ENH');
    expect(windToCategorical('45%', 'CIG2')).toBe('MDT');
    expect(windToCategorical('45%', 'CIG3')).toBe('HIGH');
  });

  test('hailToCategorical maps probabilities properly', () => {
    expect(hailToCategorical('5%', 'CIG0')).toBe('MRGL');
    expect(hailToCategorical('15%', 'CIG0')).toBe('SLGT');
    expect(hailToCategorical('60%', 'CIG0')).toBe('ENH');
    expect(hailToCategorical('45%', 'CIG2')).toBe('MDT');
  });

  test('totalSevereToCategorical maps probabilities for day3', () => {
    expect(totalSevereToCategorical('5%', 'CIG0')).toBe('MRGL');
    expect(totalSevereToCategorical('5%', 'CIG2')).toBe('SLGT');
    expect(totalSevereToCategorical('15%', 'CIG2')).toBe('ENH');
    expect(totalSevereToCategorical('45%', 'CIG2')).toBe('MDT');
  });

  test('isSignificantThreat detects # marker', () => {
    expect(isSignificantThreat('#15%')).toBe(true);
    expect(isSignificantThreat('15%')).toBe(false);
  });

  test('getHighestCategoricalRisk returns the worst of available', () => {
    const best = getHighestCategoricalRisk('60%', '5%');
    expect(best).toBe('ENH');
    const none = getHighestCategoricalRisk();
    expect(none).toBe('TSTM');
  });

  test('getCategoricalRiskDisplayName and getOutlookColor', () => {
    expect(getCategoricalRiskDisplayName('MRGL')).toContain('Marginal');
    expect(getCategoricalRiskDisplayName('HIGH')).toContain('High');

    // categorical mapping color
    expect(getOutlookColor('categorical', 'TSTM')).toBe('#C1E9C1');
    // tornado 15% mapping exists
    expect(getOutlookColor('tornado', '15%')).toBe('#FF8080');
    // unknown type returns default gray
    expect(getOutlookColor('unknown-type', '5%')).toBe('#808080');
  });
});
