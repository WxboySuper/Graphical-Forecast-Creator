import { JSDOM } from 'jsdom';
import { shouldTrack } from './analyticsUtils';

afterEach(() => {
  jest.resetAllMocks();
  try { delete (navigator as unknown as Record<string, unknown>)['sendBeacon']; } catch (e) { /* ignore */ }
  try { delete ((global as unknown) as Record<string, unknown>)['fetch']; } catch (e) { /* ignore */ }
});

describe('analyticsUtils', () => {
  test('shouldTrack respects localhost and 127.0.0.1', () => {
    expect(shouldTrack('localhost')).toBe(false);
    expect(shouldTrack('127.0.0.1')).toBe(false);
    expect(shouldTrack('example.com')).toBe(true);
  });

  test('trackPageView is no-op in default jsdom (localhost)', async () => {
    const origWindow = global.window;
    const origDocument = global.document;
    const origNavigator = global.navigator;

    // Default jest/jsdom environment usually uses localhost
    const dom = new JSDOM('');
    global.window = dom.window as unknown as Window & typeof globalThis;
    global.document = dom.window.document as unknown as Document;
    global.navigator = dom.window.navigator as unknown as Navigator;

    jest.resetModules();
    const { trackPageView } = await import('./analyticsUtils');
    expect(() => trackPageView()).not.toThrow();

    global.window = origWindow;
    global.document = origDocument;
    global.navigator = origNavigator;
  });

  test('trackPageView does not throw if navigator.sendBeacon throws', async () => {
    const origWindow = global.window;
    const origDocument = global.document;
    const origNavigator = global.navigator;

    const dom = new JSDOM('', { url: 'http://example.com/page' });
    global.window = dom.window as unknown as Window & typeof globalThis;
    global.document = dom.window.document as unknown as Document;
    global.navigator = dom.window.navigator as unknown as Navigator;

    (global.navigator as unknown as Record<string, unknown>)['sendBeacon'] = () => { throw new Error('boom'); };

    jest.resetModules();
    const { trackPageView } = await import('./analyticsUtils');
    expect(() => trackPageView()).not.toThrow();

    global.window = origWindow;
    global.document = origDocument;
    global.navigator = origNavigator;
  });

  test('trackPageView uses navigator.sendBeacon when available', async () => {
    const origWindow = global.window;
    const origDocument = global.document;
    const origNavigator = global.navigator;

    const dom = new JSDOM('', { url: 'http://example.com/page' });
    global.window = dom.window as unknown as Window & typeof globalThis;
    global.document = dom.window.document as unknown as Document;
    global.navigator = dom.window.navigator as unknown as Navigator;

    const sendBeaconMock = jest.fn();
    (global.navigator as unknown as Record<string, unknown>)['sendBeacon'] = sendBeaconMock;

    jest.resetModules();
    const { trackPageView } = await import('./analyticsUtils');
    trackPageView('example.com');

    expect(sendBeaconMock).toHaveBeenCalled();
    const blob = (sendBeaconMock.mock.calls[0] && sendBeaconMock.mock.calls[0][1]) as unknown;
    // Older test environments may not provide Blob.text(); at minimum ensure a blob-like object was passed
    expect(sendBeaconMock.mock.calls[0][0]).toBe('/api/collect');
    expect(blob).toBeDefined();
    if (typeof (blob as unknown as { type?: unknown }).type === 'string') {
      expect((blob as unknown as { type?: string }).type).toBe('application/json');
    }

    global.window = origWindow;
    global.document = origDocument;
    global.navigator = origNavigator;
  });

  test('trackPageView falls back to fetch when sendBeacon not available', async () => {
    const origWindow = global.window;
    const origDocument = global.document;
    const origNavigator = global.navigator;

    const dom = new JSDOM('', { url: 'http://example.com/other' });
    global.window = dom.window as unknown as Window & typeof globalThis;
    global.document = dom.window.document as unknown as Document;
    global.navigator = dom.window.navigator as unknown as Navigator;

    try { delete (global.navigator as unknown as Record<string, unknown>)['sendBeacon']; } catch (e) { /* ignore */ }
    (global as unknown as Record<string, unknown>)['fetch'] = jest.fn(() => Promise.resolve());

    jest.resetModules();
    const { trackPageView } = await import('./analyticsUtils');
    trackPageView('example.com');

    const fetchMock = (global as unknown as Record<string, unknown>)['fetch'] as unknown as jest.Mock;
    expect(fetchMock).toHaveBeenCalled();
    const [url, opts] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe('/api/collect');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    // body should be a JSON string containing a page property
    expect(typeof opts.body).toBe('string');
    const parsed = JSON.parse(opts.body);
    expect(parsed).toHaveProperty('page');

    global.window = origWindow;
    global.document = origDocument;
    global.navigator = origNavigator;
  });
});
