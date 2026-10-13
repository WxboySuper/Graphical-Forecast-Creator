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
import type { CategoricalRiskLevel, CIGLevel, WindProbability } from '../types/outlooks';

const RISK_RANK: Record<CategoricalRiskLevel, number> = {
  TSTM: 0,
  MRGL: 1,
  SLGT: 2,
  ENH: 3,
  MDT: 4,
  HIGH: 5,
};
const CIG_LEVELS: readonly CIGLevel[] = ['CIG0', 'CIG1', 'CIG2', 'CIG3'];

function isNondecreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value >= values[index - 1]);
}

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
    expect(tornadoToCategorical({ probability: '10%', cig: 'CIG0' })).toBe('ENH');
    expect(tornadoToCategorical({ probability: '15%', cig: 'CIG2' })).toBe('MDT');
    expect(tornadoToCategorical({ probability: '30%', cig: 'CIG0' })).toBe('MDT');
    expect(tornadoToCategorical({ probability: '45%', cig: 'CIG0' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '60%', cig: 'CIG0' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '30%', cig: 'CIG2' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '60%', cig: 'CIG1' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '15#', cig: 'CIG0' })).toBe('MDT');
    expect(tornadoToCategorical({ probability: '30#', cig: 'CIG3' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '30%#', cig: 'CIG3' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: ' 15% ', cig: 'CIG1' })).toBe('ENH');
    expect(tornadoToCategorical({ probability: '015%', cig: 'CIG0' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '15#', cig: 'CIG3' })).toBe('MDT');
    expect(tornadoToCategorical({ probability: '1%', cig: 'CIG0' })).toBe('TSTM');
  });

  test('maps probabilities across CIG fallbacks and significant variants', () => {
    const cases: Array<[CategoricalRiskLevel, CategoricalRiskLevel]> = [
      [tornadoToCategorical({ probability: '2%', cig: 'CIG3' }), 'SLGT'],
      [tornadoToCategorical({ probability: '5%', cig: 'CIG3' }), 'ENH'],
      [tornadoToCategorical({ probability: '10%', cig: 'CIG1' }), 'ENH'],
      [tornadoToCategorical({ probability: '15#', cig: 'CIG3' }), 'MDT'],
      [windToCategorical({ probability: '5%', cig: 'CIG0' }), 'MRGL'],
      [windToCategorical({ probability: '5%', cig: 'CIG2' }), 'SLGT'],
      [windToCategorical({ probability: '5%', cig: 'CIG3' }), 'SLGT'],
      [windToCategorical({ probability: '15%', cig: 'CIG0' }), 'SLGT'],
      [windToCategorical({ probability: '15%', cig: 'CIG2' }), 'ENH'],
      [windToCategorical({ probability: '15#', cig: 'CIG0' }), 'SLGT'],
      [windToCategorical({ probability: '15#', cig: 'CIG2' }), 'ENH'],
      [windToCategorical({ probability: '30%', cig: 'CIG0' }), 'ENH'],
      [windToCategorical({ probability: '30%', cig: 'CIG3' }), 'ENH'],
      [windToCategorical({ probability: '45%', cig: 'CIG2' }), 'MDT'],
      [windToCategorical({ probability: '45%', cig: 'CIG3' }), 'HIGH'],
      [windToCategorical({ probability: '45%#', cig: 'CIG3' }), 'HIGH'],
      [windToCategorical({ probability: '60%', cig: 'CIG0' }), 'MDT'],
      [windToCategorical({ probability: '90%', cig: 'CIG0' }), 'MDT'],
      [windToCategorical({ probability: '75%#', cig: 'CIG0' }), 'MDT'],
      [windToCategorical({ probability: '90%#', cig: 'CIG0' }), 'MDT'],
      [windToCategorical({ probability: '5%#', cig: 'CIG0' }), 'MRGL'],
      [hailToCategorical({ probability: '30#', cig: 'CIG2' }), 'ENH'],
      [hailToCategorical({ probability: '45%', cig: 'CIG3' }), 'TSTM'],
      [totalSevereToCategorical({ probability: '30%', cig: 'CIG3' }), 'TSTM'],
      [totalSevereToCategorical({ probability: '30%#', cig: 'CIG0' }), 'ENH'],
    ];
    expect(cases.map(([actual]) => actual)).toEqual(cases.map(([, expected]) => expected));
  });

  test('malformed probability and CIG values fail safely to TSTM', () => {
    expect(tornadoToCategorical({ probability: undefined as unknown as string })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '1#5%' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '#' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '#15%' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '30' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '1 5%' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '30%', cig: 'INVALID' as CIGLevel })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '30#', cig: 'INVALID' as CIGLevel })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '15%', cig: null as unknown as CIGLevel })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '15%', cig: '' as CIGLevel })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '15%', cig: 'cig1' as CIGLevel })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '15%', cig: 'CIG1 ' as CIGLevel })).toBe('ENH');
    expect(tornadoToCategorical({ probability: '15%', cig: ' CIG1' as CIGLevel })).toBe('ENH');
    expect(tornadoToCategorical({ probability: '015%', cig: 'CIG0' })).toBe('TSTM');
    expect(windToCategorical({ probability: '30#', cig: 'INVALID' as CIGLevel })).toBe('ENH');
  });

  test('categorical risk remains monotonic across CIG and probability', () => {
    const conversions: Array<{
      convert: (input: { probability: string; cig: CIGLevel }) => CategoricalRiskLevel;
      probabilities: readonly string[];
    }> = [
      { convert: tornadoToCategorical, probabilities: ['2%', '5%', '10%', '15%', '30%', '45%', '60%'] },
      { convert: windToCategorical, probabilities: ['5%', '15%', '30%', '45%', '60%', '75%', '90%'] },
      { convert: hailToCategorical, probabilities: ['5%', '15%', '30%', '45%', '60%'] },
      { convert: totalSevereToCategorical, probabilities: ['5%', '15%', '30%', '45%', '60%'] },
    ];

    const sequences = conversions.flatMap(({ convert, probabilities }) => [
      ...probabilities.map((probability) => CIG_LEVELS.slice(0, (convert === hailToCategorical || convert === totalSevereToCategorical) ? 3 : 4).map((cig) => RISK_RANK[convert({ probability, cig })])),
      ...CIG_LEVELS.slice(0, (convert === hailToCategorical || convert === totalSevereToCategorical) ? 3 : 4).map((cig) => probabilities.map((probability) => RISK_RANK[convert({ probability, cig })])),
    ]);

    expect(sequences.every(isNondecreasing)).toBe(true);
  });

  test('hailToCategorical maps probabilities properly', () => {
    expect(hailToCategorical({ probability: '5%', cig: 'CIG0' })).toBe('MRGL');
    expect(hailToCategorical({ probability: '15%', cig: 'CIG0' })).toBe('SLGT');
    expect(hailToCategorical({ probability: '30%', cig: 'CIG0' })).toBe('ENH');
    expect(hailToCategorical({ probability: '60%', cig: 'CIG0' })).toBe('MDT');
    expect(hailToCategorical({ probability: '45%', cig: 'CIG2' })).toBe('MDT');
    expect(hailToCategorical({ probability: '60#', cig: 'CIG0' })).toBe('MDT');
  });

  test('totalSevereToCategorical maps probabilities for day3', () => {
    const expected: Record<string, [string, string, string]> = {
      '5%': ['MRGL', 'MRGL', 'SLGT'],
      '15%': ['SLGT', 'SLGT', 'ENH'],
      '30%': ['ENH', 'ENH', 'MDT'],
      '45%': ['ENH', 'MDT', 'MDT'],
      '60%': ['MDT', 'MDT', 'MDT'],
    };

    for (const [probability, risks] of Object.entries(expected)) {
      for (const [index, cig] of (['CIG0', 'CIG1', 'CIG2'] as CIGLevel[]).entries()) {
        expect(totalSevereToCategorical({ probability, cig })).toBe(risks[index]);
      }
    }
  });

  test('isSignificantThreat detects # marker', () => {
    expect(isSignificantThreat({ probability: '15#' })).toBe(true);
    expect(isSignificantThreat({ probability: '15%#' })).toBe(true);
    expect(isSignificantThreat({ probability: '15%' })).toBe(false);
    expect(isSignificantThreat({ probability: '5%#' })).toBe(true);
    expect(isSignificantThreat({ probability: '75%#' })).toBe(true);
    expect(isSignificantThreat({ probability: '75%#', outlookType: 'tornado' })).toBe(false);
    expect(isSignificantThreat({ probability: '90%#', outlookType: 'wind' })).toBe(true);
    expect(isSignificantThreat({ probability: '90%#', outlookType: 'hail' })).toBe(false);
    expect(isSignificantThreat({ probability: '15%#', outlookType: 'categorical' })).toBe(false);
    expect(isSignificantThreat({ probability: '999%#' })).toBe(false);
    expect(isSignificantThreat({ probability: '1#5%' })).toBe(false);
    expect(isSignificantThreat({ probability: '#' })).toBe(false);
    expect(isSignificantThreat({ probability: undefined as unknown as string })).toBe(false);
    expect(isSignificantThreat({ probability: 15 as unknown as string })).toBe(false);
    expect(isSignificantThreat(null)).toBe(false);
    expect(isSignificantThreat(undefined)).toBe(false);
  });

  test('direct converters handle nullish untrusted entries safely', () => {
    expect(tornadoToCategorical(null as unknown as { probability: string })).toBe('TSTM');
    expect(windToCategorical(undefined as unknown as { probability: string })).toBe('TSTM');
    expect(hailToCategorical(null as unknown as { probability: string })).toBe('TSTM');
    expect(totalSevereToCategorical(undefined as unknown as { probability: string })).toBe('TSTM');
  });

  test('direct converters preserve explicit significant flags', () => {
    expect(windToCategorical({ probability: '45%', isSignificant: true })).toBe('MDT');
    expect(windToCategorical({ probability: '45%#', isSignificant: false })).toBe('ENH');
    expect(tornadoToCategorical({ probability: 15 as unknown as string })).toBe('TSTM');
    expect(tornadoToCategorical(15 as unknown as { probability: string })).toBe('TSTM');
  });

  test('getHighestCategoricalRisk returns the worst of available', () => {
    const best = getHighestCategoricalRisk({ tornado: '60%', wind: '5%' });
    expect(best).toBe('HIGH');
    const none = getHighestCategoricalRisk();
    expect(none).toBe('TSTM');
    expect(getHighestCategoricalRisk({
      wind: { probability: '45%', cig: 'CIG3', isSignificant: true },
    })).toBe('HIGH');
    expect(getHighestCategoricalRisk({
      wind: { probability: '45%#', cig: 'CIG3', isSignificant: true },
    })).toBe('HIGH');
    expect(getHighestCategoricalRisk({
      wind: { probability: '75%', cig: 'CIG0', isSignificant: true },
    })).toBe('MDT');
    expect(getHighestCategoricalRisk({
      wind: { probability: '45%#', cig: 'CIG3', isSignificant: false },
    })).toBe('HIGH');
    expect(getHighestCategoricalRisk({
      wind: { probability: 45 as unknown as WindProbability, cig: 'CIG3', isSignificant: true },
    })).toBe('TSTM');
    expect(getHighestCategoricalRisk({
      wind: { probability: '45%', cig: 'CIG3', isSignificant: 1 as unknown as boolean },
    })).toBe('HIGH');
    expect(getHighestCategoricalRisk(null)).toBe('TSTM');
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
