import { JSDOM } from 'jsdom';
import {
  getGoogleAnalyticsMeasurementId,
  initGoogleAnalytics,
  trackGoogleAnalyticsPageView,
} from './googleAnalytics';

const origWindow = global.window;
const origDocument = global.document;

afterEach(() => {
  global.window = origWindow;
  global.document = origDocument;
});

describe('googleAnalytics', () => {
  test('getGoogleAnalyticsMeasurementId returns a string', () => {
    expect(typeof getGoogleAnalyticsMeasurementId()).toBe('string');
  });

  test('initGoogleAnalytics is no-op on localhost', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
    global.window = dom.window as unknown as Window & typeof globalThis;
    global.document = dom.window.document;

    initGoogleAnalytics('localhost');
    expect(dom.window.document.querySelectorAll('script').length).toBe(0);
    expect(dom.window.gtag).toBeUndefined();
  });

  test('trackGoogleAnalyticsPageView does not throw when gtag is unavailable', () => {
    const dom = new JSDOM('', { url: 'https://gfc.weatherboysuper.com/forecast' });
    global.window = dom.window as unknown as Window & typeof globalThis;
    global.document = dom.window.document;

    expect(() => trackGoogleAnalyticsPageView('/forecast')).not.toThrow();
  });
});
