'use strict';

const { parseEnvelopeDsn, isAllowedSentryHost, buildEnvelopeUrl } = require('./sentry-tunnel');

describe('sentry-tunnel helpers', () => {
  it('parses DSN from an envelope header', () => {
    const body = Buffer.from(
      `${JSON.stringify({ dsn: 'https://key@o123.ingest.us.sentry.io/456' })}\n{"type":"session"}`
    );
    const dsn = parseEnvelopeDsn(body);
    expect(dsn?.hostname).toBe('o123.ingest.us.sentry.io');
    expect(buildEnvelopeUrl(dsn)).toBe('https://o123.ingest.us.sentry.io/api/456/envelope/');
  });

  it('rejects non-Sentry hosts', () => {
    expect(isAllowedSentryHost('evil.example.com')).toBe(false);
    expect(isAllowedSentryHost('o4511425762361344.ingest.us.sentry.io')).toBe(true);
  });
});
