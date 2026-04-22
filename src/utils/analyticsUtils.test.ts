import { JSDOM } from 'jsdom';
import { shouldTrack } from './analyticsUtils';

type NavigatorWithBeacon = Navigator & {
  sendBeacon?: (url: string, data: Blob) => boolean;
};

type GlobalWithFetch = typeof globalThis & {
  fetch?: jest.Mock<Promise<unknown>, [RequestInfo | URL, RequestInit?]>;
};

afterEach(() => {
  jest.resetAllMocks();
  Reflect.deleteProperty(global.navigator as NavigatorWithBeacon, 'sendBeacon');
  Reflect.deleteProperty(globalThis as GlobalWithFetch, 'fetch');
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

    (global.navigator as NavigatorWithBeacon).sendBeacon = () => {
      throw new Error('boom');
    };

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
    (global.navigator as NavigatorWithBeacon).sendBeacon = sendBeaconMock;

    jest.resetModules();
    const { trackPageView } = await import('./analyticsUtils');
    trackPageView('example.com');

    expect(sendBeaconMock).toHaveBeenCalled();
    const blob = sendBeaconMock.mock.calls[0]?.[1] as Blob | undefined;
    expect(sendBeaconMock.mock.calls[0]?.[0]).toBe('/api/collect');
    expect(blob).toBeDefined();
    if (blob && typeof blob.type === 'string') {
      expect(blob.type).toBe('application/json');
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

    Reflect.deleteProperty(global.navigator as NavigatorWithBeacon, 'sendBeacon');
    const globalWithFetch = globalThis as GlobalWithFetch;
    globalWithFetch.fetch = jest.fn(() => Promise.resolve());

    jest.resetModules();
    const { trackPageView } = await import('./analyticsUtils');
    trackPageView('example.com');

    const fetchMock = globalWithFetch.fetch as jest.Mock<Promise<unknown>, [RequestInfo | URL, RequestInit?]>;
    expect(fetchMock).toHaveBeenCalled();
    const [url, options] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    const requestOptions = options as RequestInit & { headers: Record<string, string> };
    expect(url).toBe('/api/collect');
    expect(requestOptions.method).toBe('POST');
    expect(requestOptions.headers['Content-Type']).toBe('application/json');
    expect(typeof requestOptions.body).toBe('string');
    const parsed = JSON.parse(requestOptions.body as string);
    expect(parsed).toHaveProperty('page');

    global.window = origWindow;
    global.document = origDocument;
    global.navigator = origNavigator;
  });
});
