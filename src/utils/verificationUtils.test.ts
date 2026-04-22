import { calculatePOD, formatOutlookVerificationSummary } from './verificationUtils';

describe('verificationUtils', () => {
  test('calculatePOD handles zero', () => {
    expect(calculatePOD(0,0)).toBe(0);
    expect(calculatePOD(2,2)).toBe(50);
  });

  test('formatOutlookVerificationSummary includes totals and risk lines', () => {
    const ver = { hits: 2, misses: 1, hitRate: 66.6667, byRiskLevel: { SLGT: { hits:1, misses:0, hitRate:33.3, total:3 } }, reportDetails: [] } as any;
    const s = formatOutlookVerificationSummary('tornado', ver);
    expect(s).toContain('Total Relevant Reports');
    expect(s).toContain('SLGT');
  });
});
