import { tornadoToCategorical, isSignificantThreat, getOutlookColor, getCategoricalRiskDisplayName, getHighestCategoricalRisk } from './outlookUtils';

describe('outlookUtils', () => {
  test('tornadoToCategorical simple mapping', () => {
    expect(tornadoToCategorical('2%', 'CIG0')).toBe('MRGL');
  });

  test('isSignificantThreat detects #', () => {
    expect(isSignificantThreat('5%#')).toBe(true);
    expect(isSignificantThreat('5%')).toBe(false);
  });

  test('getOutlookColor returns mapped color', () => {
    expect(getOutlookColor('tornado', '2%')).toBe('#79BA7A');
  });

  test('getCategoricalRiskDisplayName', () => {
    expect(getCategoricalRiskDisplayName('MDT')).toContain('Moderate');
  });

  test('getHighestCategoricalRisk picks highest', () => {
    const highest = getHighestCategoricalRisk('2%', '5%', '5%');
    expect(highest).toBe('MRGL');
  });
});
