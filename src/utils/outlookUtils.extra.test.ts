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
import type { CategoricalRiskLevel, CIGLevel } from '../types/outlooks';

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
    expect(tornadoToCategorical({ probability: '1%', cig: 'CIG0' })).toBe('TSTM');
  });

  test('unsupported CIG3 combinations preserve the underlying probability risk', () => {
    expect(tornadoToCategorical({ probability: '2%', cig: 'CIG3' })).toBe('SLGT');
    expect(tornadoToCategorical({ probability: '5%', cig: 'CIG3' })).toBe('ENH');
    expect(windToCategorical({ probability: '5%', cig: 'CIG3' })).toBe('SLGT');
    expect(windToCategorical({ probability: '30%', cig: 'CIG3' })).toBe('ENH');
    expect(hailToCategorical({ probability: '45%', cig: 'CIG3' })).toBe('MDT');
  });

  test('malformed probability and CIG values fail safely to TSTM', () => {
    expect(tornadoToCategorical({ probability: undefined as unknown as string })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '1#5%' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '#' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '#15%' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '30' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '1 5%' })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '30%', cig: 'INVALID' as CIGLevel })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '15%', cig: null as unknown as CIGLevel })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '15%', cig: '' as CIGLevel })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '15%', cig: 'cig1' as CIGLevel })).toBe('TSTM');
    expect(tornadoToCategorical({ probability: '15%', cig: 'CIG1 ' as CIGLevel })).toBe('TSTM');
    expect(windToCategorical({ probability: '5#' })).toBe('TSTM');
    expect(totalSevereToCategorical({ probability: '30%#' })).toBe('TSTM');
  });

  test('categorical risk remains monotonic across CIG and probability', () => {
    const riskRank: Record<CategoricalRiskLevel, number> = {
      TSTM: 0,
      MRGL: 1,
      SLGT: 2,
      ENH: 3,
      MDT: 4,
      HIGH: 5,
    };
    const conversions: Array<{
      convert: (input: { probability: string; cig: CIGLevel }) => CategoricalRiskLevel;
      probabilities: readonly string[];
    }> = [
      { convert: tornadoToCategorical, probabilities: ['2%', '5%', '10%', '15%', '30%', '45%', '60%'] },
      { convert: windToCategorical, probabilities: ['5%', '15%', '30%', '45%', '60%', '75%', '90%'] },
      { convert: hailToCategorical, probabilities: ['5%', '15%', '30%', '45%', '60%'] },
      { convert: totalSevereToCategorical, probabilities: ['5%', '15%', '30%', '45%', '60%'] },
    ];

    for (const { convert, probabilities } of conversions) {
      for (const probability of probabilities) {
        let previousRisk = riskRank[convert({ probability, cig: 'CIG0' })];
        for (const cig of ['CIG1', 'CIG2', 'CIG3'] as const) {
          const risk = riskRank[convert({ probability, cig })];
          expect(risk).toBeGreaterThanOrEqual(previousRisk);
          previousRisk = risk;
        }
      }
      for (const cig of ['CIG0', 'CIG1', 'CIG2', 'CIG3'] as const) {
        let previousProbabilityRisk = 0;
        for (const probability of probabilities) {
          const risk = riskRank[convert({ probability, cig })];
          expect(risk).toBeGreaterThanOrEqual(previousProbabilityRisk);
          previousProbabilityRisk = risk;
        }
      }
    }
  });

  test('windToCategorical maps probabilities properly', () => {
    expect(windToCategorical({ probability: '5%', cig: 'CIG0' })).toBe('MRGL');
    expect(windToCategorical({ probability: '5%', cig: 'CIG2' })).toBe('SLGT');
    expect(windToCategorical({ probability: '15%', cig: 'CIG0' })).toBe('SLGT');
    expect(windToCategorical({ probability: '15%', cig: 'CIG2' })).toBe('ENH');
    expect(windToCategorical({ probability: '30%', cig: 'CIG0' })).toBe('ENH');
    expect(windToCategorical({ probability: '60%', cig: 'CIG0' })).toBe('MDT');
    expect(windToCategorical({ probability: '45%', cig: 'CIG2' })).toBe('MDT');
    expect(windToCategorical({ probability: '45%', cig: 'CIG3' })).toBe('HIGH');
    expect(windToCategorical({ probability: '45#', cig: 'CIG0' })).toBe('MDT');
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
      '30%': ['SLGT', 'ENH', 'ENH'],
      '45%': ['ENH', 'ENH', 'MDT'],
      '60%': ['ENH', 'MDT', 'MDT'],
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
    expect(isSignificantThreat({ probability: '1#5%' })).toBe(false);
    expect(isSignificantThreat({ probability: '#' })).toBe(false);
    expect(isSignificantThreat({ probability: undefined as unknown as string })).toBe(false);
    expect(isSignificantThreat({ probability: 15 as unknown as string })).toBe(false);
  });

  test('getHighestCategoricalRisk returns the worst of available', () => {
    const best = getHighestCategoricalRisk({ tornado: '60%', wind: '5%' });
    expect(best).toBe('HIGH');
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
