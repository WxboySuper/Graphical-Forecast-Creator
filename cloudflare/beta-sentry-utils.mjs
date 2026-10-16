const parseSentryDsn = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^https:\/\/(?:[^@/]+@)?(o\d+\.ingest(?:\.[a-z]{2})?\.sentry\.io)\/(\d+)\/?$/iu);
  return match ? { host: match[1], projectId: match[2] } : null;
};

const parseSentryEnvelopeDsn = (envelope) => {
  const firstLine = new TextDecoder().decode(envelope).split('\n').find((line) => line.trim());
  if (!firstLine) return null;
  try { return parseSentryDsn(JSON.parse(firstLine)?.dsn); } catch { return null; }
};

export { parseSentryDsn, parseSentryEnvelopeDsn };
