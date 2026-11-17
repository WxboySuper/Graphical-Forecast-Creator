import type * as Sentry from '@sentry/react';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_PATTERN = /\b(?:[A-F0-9]{1,4}:){2,}[A-F0-9:]{1,}\b/gi;
const LONG_IDENTIFIER_PATTERN = /\b[A-Za-z0-9_-]{20,}\b/g;
const SENSITIVE_TAG_PATTERN = /(?:^|[_-])(uid|user|email|token|authorization)(?:$|[_-])/i;

export const redactSensitiveText = (value: string): string => value
  .replace(EMAIL_PATTERN, '[redacted-email]')
  .replace(IPV4_PATTERN, '[redacted-ip]')
  .replace(IPV6_PATTERN, '[redacted-ip]')
  .replace(LONG_IDENTIFIER_PATTERN, '[redacted-id]');

type SentryTag = NonNullable<Sentry.Event['tags']>[string];

const sanitizeTag = ([key, value]: [string, SentryTag]): [string, SentryTag] | null => {
  if (SENSITIVE_TAG_PATTERN.test(key)) return null;
  return [key, typeof value === 'string' ? redactSensitiveText(value) : value];
};

const sanitizeTags = (tags: NonNullable<Sentry.Event['tags']>): NonNullable<Sentry.Event['tags']> =>
  Object.fromEntries(Object.entries(tags).flatMap((entry) => {
    const sanitized = sanitizeTag(entry);
    return sanitized ? [sanitized] : [];
  }));

export const sanitizeBreadcrumb = (breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb => ({
  type: breadcrumb.type,
  category: breadcrumb.category,
  level: breadcrumb.level,
  timestamp: breadcrumb.timestamp,
  message: breadcrumb.message ? redactSensitiveText(breadcrumb.message) : undefined,
});

const redactExceptionValues = (event: Sentry.ErrorEvent): void => {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSensitiveText(exception.value);
  }
};

const redactEventText = (event: Sentry.ErrorEvent): void => {
  if (event.message) event.message = redactSensitiveText(event.message);
  if (event.transaction) {
    event.transaction = redactSensitiveText(event.transaction.split(/[?#]/, 1)[0]);
  }
  if (event.fingerprint) event.fingerprint = event.fingerprint.map(redactSensitiveText);
  redactExceptionValues(event);
};

export const scrubSensitiveEvent = (event: Sentry.ErrorEvent): Sentry.ErrorEvent => {
  event.user = undefined;
  event.request = undefined;
  event.contexts = undefined;
  event.extra = undefined;
  redactEventText(event);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(sanitizeBreadcrumb);
  if (event.tags) event.tags = sanitizeTags(event.tags);
  return event;
};
