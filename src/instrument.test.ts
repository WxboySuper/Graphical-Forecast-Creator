import * as Sentry from '@sentry/react';

jest.mock('@sentry/react', () => ({
  init: jest.fn(),
  reactRouterV7BrowserTracingIntegration: jest.fn(() => ({})),
  replayIntegration: jest.fn(() => ({})),
}));

describe('instrument', () => {
  const globalScope = globalThis as typeof globalThis & {
    __GFC_SENTRY_DSN__?: string;
    __GFC_SENTRY_ENVIRONMENT__?: string;
    __GFC_APP_VERSION__?: string;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    globalScope.__GFC_SENTRY_DSN__ = '';
    globalScope.__GFC_SENTRY_ENVIRONMENT__ = '';
    globalScope.__GFC_APP_VERSION__ = '1.0.0';
  });

  it('is disabled without a DSN', () => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = '';
      // skipcq: JS-0359
      const { isSentryEnabled: enabled } = require('./instrument');
      expect(enabled()).toBe(false);
      expect(Sentry.init).not.toHaveBeenCalled();
    });
  });

  it('initializes Sentry with replay, tracing, and logging when a DSN is configured', () => {
    jest.isolateModules(() => {
      globalScope.__GFC_SENTRY_DSN__ = 'https://example@o0.ingest.sentry.io/0';
      globalScope.__GFC_SENTRY_ENVIRONMENT__ = 'production';
      // skipcq: JS-0359
      const { isSentryEnabled: enabled } = require('./instrument');
      expect(enabled()).toBe(true);
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://example@o0.ingest.sentry.io/0',
          environment: 'production',
          release: 'graphical-forecast-creator@1.0.0',
          sendDefaultPii: true,
          enableLogs: true,
          normalizeDepth: 10,
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1.0,
          tracePropagationTargets: expect.arrayContaining([
            'localhost',
            expect.any(RegExp),
            expect.any(RegExp),
          ]),
        })
      );
      expect(Sentry.replayIntegration).toHaveBeenCalledWith({
        maskAllText: true,
        blockAllMedia: true,
      });
    });
  });
});
