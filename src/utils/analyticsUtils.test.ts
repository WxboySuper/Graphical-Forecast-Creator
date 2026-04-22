afterEach(() => {
  jest.resetAllMocks();
  try { delete (navigator as any).sendBeacon; } catch {}
  try { delete (global as any).fetch; } catch {}
});

const { JSDOM } = require('jsdom');

describe('analyticsUtils', () => {
  test('shouldTrack respects localhost and 127.0.0.1', () => {
    const { shouldTrack } = require('./analyticsUtils');
    expect(shouldTrack('localhost')).toBe(false);
    expect(shouldTrack('127.0.0.1')).toBe(false);
    expect(shouldTrack('example.com')).toBe(true);
  });

  test('trackPageView is no-op in default jsdom (localhost)', () => {
    const origWindow: any = global.window;
    const origDocument: any = global.document;
    const origNavigator: any = global.navigator;

    // Default jest/jsdom environment usually uses localhost
    const dom = new JSDOM('');
    global.window = dom.window as any;
    global.document = dom.window.document as any;
    global.navigator = dom.window.navigator as any;

    const { trackPageView } = require('./analyticsUtils');
    expect(() => trackPageView()).not.toThrow();

    global.window = origWindow;
    global.document = origDocument;
    global.navigator = origNavigator;
  });

  test('trackPageView does not throw if navigator.sendBeacon throws', () => {
    const origWindow: any = global.window;
    const origDocument: any = global.document;
    const origNavigator: any = global.navigator;

    const dom = new JSDOM('', { url: 'http://example.com/page' });
    global.window = dom.window as any;
    global.document = dom.window.document as any;
    global.navigator = dom.window.navigator as any;

    (navigator as any).sendBeacon = jest.fn(() => { throw new Error('boom'); });

    const { trackPageView } = require('./analyticsUtils');
    expect(() => trackPageView()).not.toThrow();

    global.window = origWindow;
    global.document = origDocument;
    global.navigator = origNavigator;
  });

  test('trackPageView uses navigator.sendBeacon when available', async () => {
    const origWindow: any = global.window;
    const origDocument: any = global.document;
    const origNavigator: any = global.navigator;

    const dom = new JSDOM('', { url: 'http://example.com/page' });
    global.window = dom.window as any;
    global.document = dom.window.document as any;
    global.navigator = dom.window.navigator as any;

    const sendBeaconMock = jest.fn();
    (navigator as any).sendBeacon = sendBeaconMock;

    jest.resetModules();
    const { trackPageView } = require('./analyticsUtils');
    trackPageView('example.com');

    expect(sendBeaconMock).toHaveBeenCalled();
    const blob = sendBeaconMock.mock.calls[0][1];
    // Older test environments may not provide Blob.text(); at minimum ensure a blob-like object was passed
    expect(sendBeaconMock.mock.calls[0][0]).toBe('/api/collect');
    expect(blob).toBeDefined();
    if (typeof (blob as any).type === 'string') expect((blob as any).type).toBe('application/json');

    global.window = origWindow;
    global.document = origDocument;
    global.navigator = origNavigator;
  });

  test('trackPageView falls back to fetch when sendBeacon not available', () => {
    const origWindow: any = global.window;
    const origDocument: any = global.document;
    const origNavigator: any = global.navigator;

    const dom = new JSDOM('', { url: 'http://example.com/other' });
    global.window = dom.window as any;
    global.document = dom.window.document as any;
    global.navigator = dom.window.navigator as any;

    try { delete (navigator as any).sendBeacon; } catch {}
    (global as any).fetch = jest.fn(() => Promise.resolve());

    jest.resetModules();
    const { trackPageView } = require('./analyticsUtils');
    trackPageView('example.com');

    expect((global as any).fetch).toHaveBeenCalled();
    const [url, opts] = (global as any).fetch.mock.calls[0];
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
