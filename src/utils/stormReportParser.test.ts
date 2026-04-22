import { formatReportDate, parseReportDate } from './stormReportParser';

describe('stormReportParser', () => {
  test('formatReportDate returns YYMMDD', () => {
    const date = new Date(2026, 0, 30); // Jan 30 2026
    expect(formatReportDate(date)).toBe('260130');
  });

  test('parseReportDate parses YYMMDD', () => {
    const parsedDate = parseReportDate('260130');
    expect(parsedDate.getFullYear()).toBe(2026);
    expect(parsedDate.getMonth()).toBe(0);
    expect(parsedDate.getDate()).toBe(30);
  });
});
