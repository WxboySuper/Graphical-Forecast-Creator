import { formatDisplayVersion } from './displayVersion';

describe('formatDisplayVersion', () => {
  test.each([
    ['2.0.0', 'v2'],
    ['2.0.0-beta.16', 'v2 beta 16'],
    ['2.1.0', 'v2.1'],
    ['2.1.0-beta.3', 'v2.1 beta 3'],
    ['dev', 'dev'],
  ])('formats %s as %s', (version, expected) => {
    expect(formatDisplayVersion(version)).toBe(expected);
  });
});
