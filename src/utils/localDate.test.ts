import { getLocalCalendarDate } from './localDate';

describe('getLocalCalendarDate', () => {
  test('formats a provided date as YYYY-MM-DD', () => {
    const dt = new Date('2026-04-21T12:00:00Z');
    expect(getLocalCalendarDate(dt)).toBe('2026-04-21');
  });
});
