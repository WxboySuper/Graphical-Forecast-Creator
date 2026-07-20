import {
  getProductAnalyticsZone,
  initProductAnalytics,
  isProductAnalyticsEnabled,
  resetProductAnalyticsForTests,
  setProductAnalyticsEnabled,
  trackProductPageView,
} from './productAnalytics';

beforeEach(() => {
  Object.assign(globalThis, {
    __GFC_UMAMI_HOST__: 'https://telemetry.gfc.weatherboysuper.com',
    __GFC_UMAMI_PRODUCTION_WEBSITE_ID__: 'prod-zone',
    __GFC_UMAMI_BETA_WEBSITE_ID__: 'beta-zone',
  });
  localStorage.clear();
  resetProductAnalyticsForTests();
  Reflect.deleteProperty(window, 'umami');
});

test('keeps production, beta, and all other hosts in separate zones', () => {
  expect(getProductAnalyticsZone('gfc.weatherboysuper.com')).toBe('production');
  expect(getProductAnalyticsZone('beta-gfc.weatherboysuper.com')).toBe('beta');
  expect(getProductAnalyticsZone('localhost')).toBeNull();
});

test('does not load a tracker when the unified preference is disabled', () => {
  localStorage.setItem('gfc-analytics-enabled', 'false');
  initProductAnalytics('gfc.weatherboysuper.com');
  expect(document.querySelector('script[data-website-id]')).toBeNull();
  expect(isProductAnalyticsEnabled()).toBe(false);
});

test('preserves the prior workflow-only opt-out until the unified preference is set', () => {
  localStorage.setItem('gfc-workflow-analytics-enabled', 'false');
  expect(isProductAnalyticsEnabled()).toBe(false);
  setProductAnalyticsEnabled(true);
  expect(isProductAnalyticsEnabled()).toBe(true);
});

test('loads the matching zone and normalizes page paths before tracking', () => {
  const track = jest.fn();
  window.umami = { track };
  initProductAnalytics('gfc.weatherboysuper.com');
  expect(document.querySelector('script[data-website-id="prod-zone"]')).not.toBeNull();
  trackProductPageView('/forecast?name=not-for-analytics', 'gfc.weatherboysuper.com');
  expect(track).toHaveBeenCalledWith('page_view', { path: '/forecast' });
});
