import { scrubSensitiveEvent } from './instrument-privacy';
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
