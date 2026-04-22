import { formatReportDate, parseReportDate } from './stormReportParser';

describe('stormReportParser', () => {
  test('formatReportDate returns YYMMDD', () => {
    const d = new Date(2026,0,30); // Jan 30 2026
    expect(formatReportDate(d)).toBe('260130');
  });

  test('parseReportDate parses YYMMDD', () => {
    const p = parseReportDate('260130');
    expect(p.getFullYear()).toBe(2026);
    expect(p.getMonth()).toBe(0);
    expect(p.getDate()).toBe(30);
  });
});
