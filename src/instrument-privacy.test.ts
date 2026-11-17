import { sanitizeStreamedSpan, scrubSensitiveEvent, scrubTransactionEvent } from './instrument-privacy';
import type * as Sentry from '@sentry/react';

test('scrubs identity, addresses, request data, and breadcrumb context from Sentry events', () => {
  const privateUid = 'firebase-user-id-123456789';
  const event = {
    message: 'Failure for forecaster@example.com from 192.0.2.18 at 2001:db8::1',
    transaction: `/forecast/${privateUid}?uid=${privateUid}`,
    user: { id: privateUid, email: 'forecaster@example.com' },
    request: { url: `https://gfcweather.com/?uid=${privateUid}` },
    contexts: { account: { uid: privateUid } },
    extra: { message: privateUid },
    tags: { uid: privateUid, section: 'forecast' },
    breadcrumbs: [{ category: 'console', message: privateUid, data: { uid: privateUid } }],
    exception: { values: [{ value: `Failed for forecaster@example.com and ${privateUid}` }] },
  } as unknown as Sentry.ErrorEvent;

  const scrubbed = scrubSensitiveEvent(event);

  expect(scrubbed.user).toBeUndefined();
  expect(scrubbed.request).toBeUndefined();
  expect(scrubbed.contexts).toBeUndefined();
  expect(scrubbed.extra).toBeUndefined();
  expect(scrubbed.tags).toEqual({ section: 'forecast' });
  expect(scrubbed.message).toBe('Failure for [redacted-email] from [redacted-ip] at [redacted-ip]');
  expect(scrubbed.transaction).toBe('/forecast/[redacted-id]');
  expect(scrubbed.exception?.values?.[0].value).toBe('Failed for [redacted-email] and [redacted-id]');
  expect(scrubbed.breadcrumbs?.[0]).toEqual(expect.objectContaining({
    category: 'console',
    message: '[redacted-id]',
  }));
  expect(scrubbed.breadcrumbs?.[0].data).toBeUndefined();
});

test('scrubs identifiers and query strings from Sentry transactions and static spans', () => {
  const privateUid = 'firebase-user-id-123456789';
  const privateEmail = 'forecaster@example.com';
  const event = {
    type: 'transaction',
    transaction: `/forecast/${privateUid}?email=${privateEmail}`,
    request: {
      url: `https://gfcweather.com/forecast/${privateUid}?email=${privateEmail}`,
      query_string: { email: privateEmail, uid: privateUid },
      headers: { Authorization: 'private-token-value' },
    },
    spans: [{
      description: `GET https://gfcweather.com/forecast/${privateUid}?email=${privateEmail}`,
      data: {
        'url.full': `https://gfcweather.com/forecast/${privateUid}?email=${privateEmail}`,
        'url.query': `email=${privateEmail}&uid=${privateUid}`,
        'user.email': privateEmail,
        uid: privateUid,
      },
    }],
  } as unknown as Parameters<NonNullable<Sentry.BrowserOptions['beforeSendTransaction']>>[0];

  const scrubbed = scrubTransactionEvent(event);

  expect(scrubbed.transaction).toBe('/forecast/[redacted-id]');
  expect(scrubbed.request).toEqual({
    method: undefined,
    url: 'https://gfcweather.com/forecast/[redacted-id]',
  });
  expect(scrubbed.spans?.[0].description).toBe('GET https://gfcweather.com/forecast/[redacted-id]');
  expect(scrubbed.spans?.[0].data).toEqual({
    'url.full': 'https://gfcweather.com/forecast/[redacted-id]',
    'user.email': '[redacted-email]',
    uid: '[redacted-id]',
  });
  expect(JSON.stringify(scrubbed)).not.toContain(privateUid);
  expect(JSON.stringify(scrubbed)).not.toContain(privateEmail);
  expect(JSON.stringify(scrubbed)).not.toContain('private-token-value');
});

test('scrubs streamed span names and URL, query, email, and UID attributes', () => {
  const privateUid = 'firebase-user-id-123456789';
  const privateEmail = 'forecaster@example.com';
  const span = {
    trace_id: 'trace-id',
    span_id: 'span-id',
    name: `/forecast/${privateUid}?email=${privateEmail}`,
    start_timestamp: 1,
    status: 'ok',
    is_segment: true,
    attributes: {
      'url.full': `https://gfcweather.com/forecast/${privateUid}?email=${privateEmail}`,
      'url.query': `email=${privateEmail}&uid=${privateUid}`,
      'user.email': privateEmail,
      uid: privateUid,
    },
  } as unknown as Parameters<NonNullable<Sentry.BrowserOptions['beforeSendSpan']>>[0];

  const scrubbed = sanitizeStreamedSpan(span);

  expect(scrubbed.name).toBe('/forecast/[redacted-id]');
  expect(scrubbed.attributes).toEqual({
    'url.full': 'https://gfcweather.com/forecast/[redacted-id]',
    'user.email': '[redacted-email]',
    uid: '[redacted-id]',
  });
  expect(JSON.stringify(scrubbed)).not.toContain(privateUid);
  expect(JSON.stringify(scrubbed)).not.toContain(privateEmail);
});
