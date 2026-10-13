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
import type { CIGLevel } from '../types/outlooks';

type CategoricalConverter = (input: { probability: string; cig: CIGLevel }) => string;
const CIG3_RISK_CASES: Array<{ hazard: string; probability: string; convert: CategoricalConverter; expected: string }> = [
  { hazard: 'tornado', probability: '2%', convert: tornadoToCategorical, expected: 'SLGT' },
  { hazard: 'tornado', probability: '5%', convert: tornadoToCategorical, expected: 'ENH' },
  { hazard: 'tornado', probability: '10%', convert: tornadoToCategorical, expected: 'ENH' },
  { hazard: 'tornado', probability: '15%', convert: tornadoToCategorical, expected: 'MDT' },
  { hazard: 'tornado', probability: '30%', convert: tornadoToCategorical, expected: 'HIGH' },
  { hazard: 'tornado', probability: '45%', convert: tornadoToCategorical, expected: 'HIGH' },
  { hazard: 'tornado', probability: '60%', convert: tornadoToCategorical, expected: 'HIGH' },
  { hazard: 'wind', probability: '5%', convert: windToCategorical, expected: 'SLGT' },
  { hazard: 'wind', probability: '15%', convert: windToCategorical, expected: 'ENH' },
  { hazard: 'wind', probability: '30%', convert: windToCategorical, expected: 'ENH' },
  { hazard: 'wind', probability: '45%', convert: windToCategorical, expected: 'HIGH' },
  { hazard: 'wind', probability: '60%', convert: windToCategorical, expected: 'HIGH' },
  { hazard: 'wind', probability: '75%', convert: windToCategorical, expected: 'HIGH' },
  { hazard: 'wind', probability: '90%', convert: windToCategorical, expected: 'HIGH' },
  { hazard: 'hail', probability: '5%', convert: hailToCategorical, expected: 'SLGT' },
  { hazard: 'hail', probability: '15%', convert: hailToCategorical, expected: 'ENH' },
  { hazard: 'hail', probability: '30%', convert: hailToCategorical, expected: 'ENH' },
  { hazard: 'hail', probability: '45%', convert: hailToCategorical, expected: 'MDT' },
  { hazard: 'hail', probability: '60%', convert: hailToCategorical, expected: 'MDT' },
  { hazard: 'Day 3 total severe', probability: '5%', convert: totalSevereToCategorical, expected: 'SLGT' },
  { hazard: 'Day 3 total severe', probability: '15%', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '30%', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '45%', convert: totalSevereToCategorical, expected: 'MDT' },
  { hazard: 'Day 3 total severe', probability: '60%', convert: totalSevereToCategorical, expected: 'MDT' },
];

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
    expect(tornadoToCategorical({ probability: '2%', cig: 'CIG0' })).toBe('MRGL');
    expect(tornadoToCategorical({ probability: '2%', cig: 'CIG2' })).toBe('SLGT');
    expect(tornadoToCategorical({ probability: '5%', cig: 'CIG0' })).toBe('SLGT');
    expect(tornadoToCategorical({ probability: '5%', cig: 'CIG2' })).toBe('ENH');
    expect(tornadoToCategorical({ probability: '15%', cig: 'CIG2' })).toBe('MDT');
    expect(tornadoToCategorical({ probability: '30%', cig: 'CIG2' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '60%', cig: 'CIG1' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '2%', cig: 'CIG3' })).toBe('SLGT');
    expect(tornadoToCategorical({ probability: '5%', cig: 'CIG3' })).toBe('ENH');
    expect(tornadoToCategorical({ probability: '1%', cig: 'CIG0' })).toBe('TSTM');
  });

  test('invalid probability and CIG inputs fail safely to TSTM', () => {
    expect(tornadoToCategorical({ probability: null as unknown as string })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: undefined as unknown as string })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '5%', cig: 'CIG4' as CIGLevel })).toBe('TSTM');
  });

  test.each(CIG3_RISK_CASES)('$hazard $probability preserves its highest mapped risk at CIG3', ({ convert, probability, expected }) => {
    expect(convert({ probability, cig: 'CIG3' })).toBe(expected);
  });

  test('windToCategorical maps probabilities properly', () => {
    expect(windToCategorical({ probability: '5%', cig: 'CIG0' })).toBe('MRGL');
    expect(windToCategorical({ probability: '5%', cig: 'CIG2' })).toBe('SLGT');
    expect(windToCategorical({ probability: '15%', cig: 'CIG0' })).toBe('SLGT');
    expect(windToCategorical({ probability: '15%', cig: 'CIG2' })).toBe('ENH');
    expect(windToCategorical({ probability: '45%', cig: 'CIG2' })).toBe('MDT');
    expect(windToCategorical({ probability: '45%', cig: 'CIG3' })).toBe('HIGH');
    expect(windToCategorical({ probability: '5%', cig: 'CIG3' })).toBe('SLGT');
    expect(windToCategorical({ probability: '15%', cig: 'CIG3' })).toBe('ENH');
  });

  test('hailToCategorical maps probabilities properly', () => {
    expect(hailToCategorical({ probability: '5%', cig: 'CIG0' })).toBe('MRGL');
    expect(hailToCategorical({ probability: '15%', cig: 'CIG0' })).toBe('SLGT');
    expect(hailToCategorical({ probability: '60%', cig: 'CIG0' })).toBe('ENH');
    expect(hailToCategorical({ probability: '45%', cig: 'CIG2' })).toBe('MDT');
    expect(hailToCategorical({ probability: '45%', cig: 'CIG3' })).toBe('MDT');
  });

  test('totalSevereToCategorical maps probabilities for day3', () => {
    const expected: Record<string, [string, string, string]> = {
      '5%': ['MRGL', 'MRGL', 'SLGT'],
      '15%': ['SLGT', 'SLGT', 'ENH'],
      '30%': ['SLGT', 'ENH', 'ENH'],
      '45%': ['ENH', 'ENH', 'MDT'],
      '60%': ['ENH', 'MDT', 'MDT'],
    };

    for (const [probability, risks] of Object.entries(expected)) {
      for (const [index, cig] of (['CIG0', 'CIG1', 'CIG2'] as CIGLevel[]).entries()) {
        expect(totalSevereToCategorical({ probability, cig })).toBe(risks[index]);
      }
    }
    expect(totalSevereToCategorical({ probability: '30%', cig: 'CIG3' })).toBe('ENH');
  });

  test('isSignificantThreat detects # marker', () => {
    expect(isSignificantThreat({ probability: '#15%' })).toBe(true);
    expect(isSignificantThreat({ probability: '15%' })).toBe(false);
  });

  test('getHighestCategoricalRisk returns the worst of available', () => {
    const best = getHighestCategoricalRisk({ tornado: '60%', wind: '5%' });
    expect(best).toBe('ENH');
    const none = getHighestCategoricalRisk();
    expect(none).toBe('TSTM');
  });

  test('getCategoricalRiskDisplayName and getOutlookColor', () => {
    expect(getCategoricalRiskDisplayName('MRGL')).toContain('Marginal');
    expect(getCategoricalRiskDisplayName('HIGH')).toContain('High');

    // categorical mapping color
    expect(getOutlookColor({ outlookType: 'categorical', probability: 'TSTM' })).toBe('#C1E9C1');
    // tornado 15% mapping exists
    expect(getOutlookColor({ outlookType: 'tornado', probability: '15%' })).toBe('#FF8080');
    // unknown type returns default gray
    expect(getOutlookColor({ outlookType: 'unknown-type', probability: '5%' })).toBe('#808080');
  });
});
