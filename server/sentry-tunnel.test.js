'use strict';

const {
  parseAllowedSentryEndpoint,
  parseSentryDsnString,
  isAllowedSentryHost,
  buildEnvelopeUrl,
  getConfiguredSentryEndpoint,
} = require('./sentry-tunnel');

describe('sentry-tunnel helpers', () => {
  it('parses DSN from an envelope header', () => {
    const body = Buffer.from(
      `${JSON.stringify({ dsn: 'https://key@o123.ingest.us.sentry.io/456' })}\n{"type":"session"}`
    );
    const endpoint = parseAllowedSentryEndpoint(body);
    expect(endpoint).toEqual({ host: 'o123.ingest.us.sentry.io', projectId: '456' });
    expect(buildEnvelopeUrl(endpoint.host, endpoint.projectId)).toBe(
      'https://o123.ingest.us.sentry.io/api/456/envelope/'
    );
  });

  it('parses configured DSN strings', () => {
    expect(parseSentryDsnString('https://key@o123.ingest.us.sentry.io/456')).toEqual({
      host: 'o123.ingest.us.sentry.io',
      projectId: '456',
    });
  });

  it('returns null for non-JSON envelope headers', () => {
    const body = Buffer.from('not-json\n{}');
    expect(parseAllowedSentryEndpoint(body)).toBeNull();
  });

  it('prefers SENTRY_BROWSER_DSN over SENTRY_DSN for tunnel validation', () => {
    const previousBrowser = process.env.SENTRY_BROWSER_DSN;
    const previousServer = process.env.SENTRY_DSN;
    process.env.SENTRY_BROWSER_DSN = 'https://key@o111.ingest.us.sentry.io/111';
    process.env.SENTRY_DSN = 'https://key@o222.ingest.us.sentry.io/222';

    expect(getConfiguredSentryEndpoint()).toEqual({
      host: 'o111.ingest.us.sentry.io',
      projectId: '111',
    });

    if (previousBrowser === undefined) {
      delete process.env.SENTRY_BROWSER_DSN;
    } else {
      process.env.SENTRY_BROWSER_DSN = previousBrowser;
    }
    if (previousServer === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = previousServer;
    }
  });

  it('rejects malformed DSN values', () => {
    const httpBody = Buffer.from(
      `${JSON.stringify({ dsn: 'http://o123.ingest.us.sentry.io/456' })}\n{}`
    );
    const invalidProjectBody = Buffer.from(
      `${JSON.stringify({ dsn: 'https://o123.ingest.us.sentry.io/not-a-project' })}\n{}`
    );
    expect(parseAllowedSentryEndpoint(httpBody)).toBeNull();
    expect(parseAllowedSentryEndpoint(invalidProjectBody)).toBeNull();
    expect(parseSentryDsnString('http://evil.example/1')).toBeNull();
  });

  it('rejects non-Sentry hosts', () => {
    expect(isAllowedSentryHost('evil.example.com')).toBe(false);
    expect(isAllowedSentryHost('o4511425762361344.ingest.us.sentry.io')).toBe(true);
  });
});
