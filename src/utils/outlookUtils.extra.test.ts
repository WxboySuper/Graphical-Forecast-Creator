import * as U from './outlookUtils';

describe('outlookUtils extra', () => {
  test('getOutlookConstraints returns correct sets for days', () => {
    const d1 = U.getOutlookConstraints(1);
    expect(d1.outlookTypes).toEqual(expect.arrayContaining(['tornado', 'wind', 'hail', 'categorical']));
    const d3 = U.getOutlookConstraints(3);
    expect(d3.allowedCategorical).not.toContain('HIGH');
    const d8 = U.getOutlookConstraints(8);
    expect(d8.outlookTypes).toContain('day4-8');
    const d99 = U.getOutlookConstraints(99);
    expect(d99.outlookTypes).toEqual([]);
  });

  test('tornadoToCategorical maps probabilities properly', () => {
    expect(U.tornadoToCategorical('2%', 'CIG0')).toBe('MRGL');
    expect(U.tornadoToCategorical('2%', 'CIG2')).toBe('SLGT');
    expect(U.tornadoToCategorical('5%', 'CIG0')).toBe('SLGT');
    expect(U.tornadoToCategorical('5%', 'CIG2')).toBe('ENH');
    expect(U.tornadoToCategorical('15%', 'CIG2')).toBe('MDT');
    expect(U.tornadoToCategorical('30%', 'CIG2')).toBe('HIGH');
    expect(U.tornadoToCategorical('60%', 'CIG1')).toBe('HIGH');
    expect(U.tornadoToCategorical('1%', 'CIG0')).toBe('TSTM');
  });

  test('windToCategorical maps probabilities properly', () => {
    expect(U.windToCategorical('5%', 'CIG0')).toBe('MRGL');
    expect(U.windToCategorical('5%', 'CIG2')).toBe('SLGT');
    expect(U.windToCategorical('15%', 'CIG0')).toBe('SLGT');
    expect(U.windToCategorical('15%', 'CIG2')).toBe('ENH');
    expect(U.windToCategorical('45%', 'CIG2')).toBe('MDT');
    expect(U.windToCategorical('45%', 'CIG3')).toBe('HIGH');
  });

  test('hailToCategorical maps probabilities properly', () => {
    expect(U.hailToCategorical('5%', 'CIG0')).toBe('MRGL');
    expect(U.hailToCategorical('15%', 'CIG0')).toBe('SLGT');
    expect(U.hailToCategorical('60%', 'CIG0')).toBe('ENH');
    expect(U.hailToCategorical('45%', 'CIG2')).toBe('MDT');
  });

  test('totalSevereToCategorical maps probabilities for day3', () => {
    expect(U.totalSevereToCategorical('5%', 'CIG0')).toBe('MRGL');
    expect(U.totalSevereToCategorical('5%', 'CIG2')).toBe('SLGT');
    expect(U.totalSevereToCategorical('15%', 'CIG2')).toBe('ENH');
    expect(U.totalSevereToCategorical('45%', 'CIG2')).toBe('MDT');
  });

  test('isSignificantThreat detects # marker', () => {
    expect(U.isSignificantThreat('#15%')).toBe(true);
    expect(U.isSignificantThreat('15%')).toBe(false);
  });

  test('getHighestCategoricalRisk returns the worst of available', () => {
    const best = U.getHighestCategoricalRisk('60%', '5%', undefined);
    expect(best).toBe('ENH');
    const none = U.getHighestCategoricalRisk(undefined, undefined, undefined);
    expect(none).toBe('TSTM');
  });

  test('getCategoricalRiskDisplayName and getOutlookColor', () => {
    expect(U.getCategoricalRiskDisplayName('MRGL')).toContain('Marginal');
    expect(U.getCategoricalRiskDisplayName('HIGH')).toContain('High');

    // categorical mapping color
    expect(U.getOutlookColor('categorical', 'TSTM')).toBe('#C1E9C1');
    // tornado 15% mapping exists
    expect(U.getOutlookColor('tornado', '15%')).toBe('#FF8080');
    // unknown type returns default gray
    expect(U.getOutlookColor('unknown-type', '5%')).toBe('#808080');
  });
});
