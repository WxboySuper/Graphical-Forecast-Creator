import type * as Sentry from '@sentry/react';

type SentryTransaction = Parameters<NonNullable<Sentry.BrowserOptions['beforeSendTransaction']>>[0];
type SentryStreamedSpan = Parameters<NonNullable<Sentry.BrowserOptions['beforeSendSpan']>>[0];
type SentryStaticSpan = NonNullable<Sentry.Event['spans']>[number];

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_PATTERN = /\b(?:[A-F0-9]{1,4}:){2,}[A-F0-9:]{1,}\b/gi;
const LONG_IDENTIFIER_PATTERN = /\b[A-Za-z0-9_-]{20,}\b/g;
const SENSITIVE_TAG_PATTERN = /(?:^|[_-])(uid|user|email|token|authorization)(?:$|[_-])/;

export const redactSensitiveText = (value: string): string => value
  .replace(EMAIL_PATTERN, '[redacted-email]')
  .replace(IPV4_PATTERN, '[redacted-ip]')
  .replace(IPV6_PATTERN, '[redacted-ip]')
  .replace(LONG_IDENTIFIER_PATTERN, '[redacted-id]');

const removeUrlQuery = (value: string): string => value.split(/[?#]/, 1)[0];

const isQueryField = (key: string): boolean => /(?:^|[._-])(query|query_string)(?:$|[._-])/i.test(key);
const isUrlField = (key: string): boolean => /(?:^|[._-])url(?:$|[._-])/i.test(key);

const sanitizeStringValue = (value: string, key: string): string | undefined => {
  if (isQueryField(key)) return undefined;
  const safeValue = isUrlField(key) ? removeUrlQuery(value) : value;
  return redactSensitiveText(safeValue);
};

const sanitizeNestedValue = (value: unknown, key: string): unknown => {
  if (isQueryField(key)) return undefined;
  if (typeof value === 'string') return sanitizeStringValue(value, key);
  if (Array.isArray(value)) return value.map((item) => sanitizeNestedValue(item, key));
  if (value && typeof value === 'object') return sanitizeRecord(value as Record<string, unknown>, key);
  return value;
};

const sanitizeRecord = <T extends Record<string, unknown>>(record: T, contextKey = ''): T =>
  Object.fromEntries(Object.entries(record).flatMap(([key, value]) => {
    const inheritedContext = isUrlField(contextKey) || isQueryField(contextKey);
    const sanitized = sanitizeNestedValue(value, inheritedContext ? contextKey : key);
    return sanitized === undefined ? [] : [[key, sanitized]];
  })) as T;

type SentryTag = NonNullable<Sentry.Event['tags']>[string];

const sanitizeTag = ([key, value]: [string, SentryTag]): [string, SentryTag] | null => {
  if (isSensitiveTagKey(key)) return null;
  return [key, typeof value === 'string' ? redactSensitiveText(value) : value];
};

const isSensitiveTagKey = (key: string): boolean => {
  const normalizedKey = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return SENSITIVE_TAG_PATTERN.test(normalizedKey);
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

const redactExceptionValues = (event: Sentry.Event): void => {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSensitiveText(exception.value);
  }
};

const redactEventText = (event: Sentry.Event): void => {
  if (event.message) event.message = redactSensitiveText(event.message);
  if (event.transaction) {
    event.transaction = redactSensitiveText(event.transaction.split(/[?#]/, 1)[0]);
  }
  if (event.fingerprint) event.fingerprint = event.fingerprint.map(redactSensitiveText);
  redactExceptionValues(event);
};

const sanitizeRequest = (request: NonNullable<Sentry.Event['request']>): NonNullable<Sentry.Event['request']> => ({
  method: request.method,
  url: request.url ? redactSensitiveText(removeUrlQuery(request.url)) : undefined,
});

const sanitizeSpanDescription = (description: string | undefined): string | undefined =>
  description ? redactSensitiveText(removeUrlQuery(description)) : undefined;

const sanitizeStaticSpan = (span: SentryStaticSpan): SentryStaticSpan => ({
  ...span,
  description: sanitizeSpanDescription(span.description),
  data: span.data ? sanitizeRecord(span.data) : span.data,
});

export const sanitizeStreamedSpan = (span: SentryStreamedSpan): SentryStreamedSpan => ({
  ...span,
  name: sanitizeSpanDescription(span.name) ?? '',
  attributes: span.attributes ? sanitizeRecord(span.attributes) : span.attributes,
  links: span.links?.map((link) => ({
    ...link,
    attributes: link.attributes ? sanitizeRecord(link.attributes) : link.attributes,
  })),
});

export const scrubTransactionEvent = <T extends SentryTransaction>(event: T): T => {
  const request = event.request;
  scrubSensitiveEvent(event);
  if (request) event.request = sanitizeRequest(request);
  if (event.spans) event.spans = event.spans.map(sanitizeStaticSpan);
  return event;
};

export const scrubSensitiveEvent = <T extends Sentry.Event>(event: T): T => {
  event.user = undefined;
  event.request = undefined;
  event.contexts = undefined;
  event.extra = undefined;
  redactEventText(event);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(sanitizeBreadcrumb);
  if (event.tags) event.tags = sanitizeTags(event.tags);
  return event;
};
