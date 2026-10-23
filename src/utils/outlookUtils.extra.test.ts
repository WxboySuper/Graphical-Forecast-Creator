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
const CATEGORICAL_RISK_CASES: Array<{ hazard: string; probability: string; cig: CIGLevel; convert: CategoricalConverter; expected: string }> = [
  { hazard: 'tornado', probability: '2%', cig: 'CIG0', convert: tornadoToCategorical, expected: 'MRGL' },
  { hazard: 'tornado', probability: '2%', cig: 'CIG2', convert: tornadoToCategorical, expected: 'SLGT' },
  { hazard: 'tornado', probability: '2%', cig: 'CIG3', convert: tornadoToCategorical, expected: 'SLGT' },
  { hazard: 'tornado', probability: '5%', cig: 'CIG0', convert: tornadoToCategorical, expected: 'SLGT' },
  { hazard: 'tornado', probability: '5%', cig: 'CIG2', convert: tornadoToCategorical, expected: 'ENH' },
  { hazard: 'tornado', probability: '5%', cig: 'CIG3', convert: tornadoToCategorical, expected: 'ENH' },
  { hazard: 'tornado', probability: '15%', cig: 'CIG2', convert: tornadoToCategorical, expected: 'MDT' },
  { hazard: 'tornado', probability: '30%', cig: 'CIG2', convert: tornadoToCategorical, expected: 'HIGH' },
  { hazard: 'tornado', probability: '60%', cig: 'CIG1', convert: tornadoToCategorical, expected: 'HIGH' },
  { hazard: 'tornado', probability: '1%', cig: 'CIG0', convert: tornadoToCategorical, expected: 'TSTM' },
  { hazard: 'wind', probability: '5%', cig: 'CIG0', convert: windToCategorical, expected: 'MRGL' },
  { hazard: 'wind', probability: '5%', cig: 'CIG2', convert: windToCategorical, expected: 'SLGT' },
  { hazard: 'wind', probability: '5%', cig: 'CIG3', convert: windToCategorical, expected: 'SLGT' },
  { hazard: 'wind', probability: '15%', cig: 'CIG0', convert: windToCategorical, expected: 'SLGT' },
  { hazard: 'wind', probability: '15%', cig: 'CIG2', convert: windToCategorical, expected: 'ENH' },
  { hazard: 'wind', probability: '15%', cig: 'CIG3', convert: windToCategorical, expected: 'ENH' },
  { hazard: 'wind', probability: '45%', cig: 'CIG2', convert: windToCategorical, expected: 'MDT' },
  { hazard: 'wind', probability: '45%', cig: 'CIG3', convert: windToCategorical, expected: 'HIGH' },
  { hazard: 'wind', probability: '30%', cig: 'CIG3', convert: windToCategorical, expected: 'ENH' },
  { hazard: 'wind', probability: '60%', cig: 'CIG3', convert: windToCategorical, expected: 'HIGH' },
  { hazard: 'wind', probability: '75%', cig: 'CIG3', convert: windToCategorical, expected: 'HIGH' },
  { hazard: 'wind', probability: '90%', cig: 'CIG3', convert: windToCategorical, expected: 'HIGH' },
  { hazard: 'hail', probability: '5%', cig: 'CIG0', convert: hailToCategorical, expected: 'MRGL' },
  { hazard: 'hail', probability: '15%', cig: 'CIG0', convert: hailToCategorical, expected: 'SLGT' },
  { hazard: 'hail', probability: '60%', cig: 'CIG0', convert: hailToCategorical, expected: 'ENH' },
  { hazard: 'hail', probability: '45%', cig: 'CIG2', convert: hailToCategorical, expected: 'MDT' },
  { hazard: 'hail', probability: '45%', cig: 'CIG3', convert: hailToCategorical, expected: 'MDT' },
  { hazard: 'hail', probability: '5%', cig: 'CIG3', convert: hailToCategorical, expected: 'SLGT' },
  { hazard: 'hail', probability: '15%', cig: 'CIG3', convert: hailToCategorical, expected: 'ENH' },
  { hazard: 'hail', probability: '30%', cig: 'CIG3', convert: hailToCategorical, expected: 'ENH' },
  { hazard: 'hail', probability: '60%', cig: 'CIG3', convert: hailToCategorical, expected: 'MDT' },
  { hazard: 'Day 3 total severe', probability: '5%', cig: 'CIG0', convert: totalSevereToCategorical, expected: 'MRGL' },
  { hazard: 'Day 3 total severe', probability: '5%', cig: 'CIG1', convert: totalSevereToCategorical, expected: 'MRGL' },
  { hazard: 'Day 3 total severe', probability: '5%', cig: 'CIG2', convert: totalSevereToCategorical, expected: 'SLGT' },
  { hazard: 'Day 3 total severe', probability: '5%', cig: 'CIG3', convert: totalSevereToCategorical, expected: 'SLGT' },
  { hazard: 'Day 3 total severe', probability: '15%', cig: 'CIG0', convert: totalSevereToCategorical, expected: 'SLGT' },
  { hazard: 'Day 3 total severe', probability: '15%', cig: 'CIG1', convert: totalSevereToCategorical, expected: 'SLGT' },
  { hazard: 'Day 3 total severe', probability: '15%', cig: 'CIG2', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '15%', cig: 'CIG3', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '30%', cig: 'CIG0', convert: totalSevereToCategorical, expected: 'SLGT' },
  { hazard: 'Day 3 total severe', probability: '30%', cig: 'CIG1', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '30%', cig: 'CIG2', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '30%', cig: 'CIG3', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '45%', cig: 'CIG0', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '45%', cig: 'CIG1', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '45%', cig: 'CIG2', convert: totalSevereToCategorical, expected: 'MDT' },
  { hazard: 'Day 3 total severe', probability: '45%', cig: 'CIG3', convert: totalSevereToCategorical, expected: 'MDT' },
  { hazard: 'Day 3 total severe', probability: '60%', cig: 'CIG0', convert: totalSevereToCategorical, expected: 'ENH' },
  { hazard: 'Day 3 total severe', probability: '60%', cig: 'CIG1', convert: totalSevereToCategorical, expected: 'MDT' },
  { hazard: 'Day 3 total severe', probability: '60%', cig: 'CIG2', convert: totalSevereToCategorical, expected: 'MDT' },
  { hazard: 'Day 3 total severe', probability: '60%', cig: 'CIG3', convert: totalSevereToCategorical, expected: 'MDT' },
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

  test.each(CATEGORICAL_RISK_CASES)('$hazard $probability at $cig maps to $expected', ({ convert, probability, cig, expected }) => {
    expect(convert({ probability, cig })).toBe(expected);
  });

  test('invalid probability and CIG inputs fail safely to TSTM', () => {
    expect(tornadoToCategorical({ probability: null as unknown as string })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: undefined as unknown as string })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '5%', cig: 'CIG4' as CIGLevel })).toBe('TSTM');
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
