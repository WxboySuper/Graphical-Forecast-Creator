import {
  DEFAULT_ALERT_BANNER_CONFIG,
  isAlertBannerScheduleActive,
  normalizeAlertBannerConfig,
} from './alertBannerConfig';

describe('alertBannerConfig', () => {
  const now = Date.parse('2026-06-01T12:00:00.000Z');

  test('isAlertBannerScheduleActive respects enabled flag', () => {
    expect(isAlertBannerScheduleActive({ enabled: false }, now)).toBe(false);
    expect(isAlertBannerScheduleActive({ enabled: true }, now)).toBe(true);
  });

  test('isAlertBannerScheduleActive respects startsAt and expiresAt', () => {
    expect(
      isAlertBannerScheduleActive(
        {
          enabled: true,
          startsAt: '2026-06-01T13:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);

    expect(
      isAlertBannerScheduleActive(
        {
          enabled: true,
          expiresAt: '2026-06-01T12:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);

    expect(
      isAlertBannerScheduleActive(
        {
          enabled: true,
          startsAt: '2026-06-01T11:00:00.000Z',
          expiresAt: '2026-06-01T13:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
  });

  test('normalizeAlertBannerConfig fills defaults and optional fields', () => {
    expect(normalizeAlertBannerConfig(null)).toEqual(DEFAULT_ALERT_BANNER_CONFIG);

    expect(
      normalizeAlertBannerConfig({
        enabled: true,
        message: 'Hello',
        type: 'warning',
        dismissible: false,
        linkUrl: '/updates',
        linkLabel: 'Learn more',
        startsAt: '2026-06-01T00:00:00.000Z',
      }),
    ).toEqual({
      enabled: true,
      message: 'Hello',
      type: 'warning',
      dismissible: false,
      id: undefined,
      linkUrl: '/updates',
      linkLabel: 'Learn more',
      startsAt: '2026-06-01T00:00:00.000Z',
      expiresAt: undefined,
    });
  });
});
