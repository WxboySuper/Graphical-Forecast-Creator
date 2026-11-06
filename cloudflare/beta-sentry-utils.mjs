const parseSentryDsn = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^https:\/\/(?:[^@/]+@)?(o\d+\.ingest(?:\.[a-z0-9-]+)?\.sentry\.io)\/(\d+)\/?$/iu);
  // Restrict forwarding to Sentry's hosted ingest domains to prevent arbitrary DSNs becoming an SSRF proxy.
  return match ? { host: match[1].toLowerCase(), projectId: match[2] } : null;
};

const parseSentryEnvelopeDsn = (envelope) => {
  const firstLine = new TextDecoder().decode(envelope).split('\n').find((line) => line.trim());
  if (!firstLine) return null;
  try { return parseSentryDsn(JSON.parse(firstLine)?.dsn); } catch { return null; }
};

export { parseSentryDsn, parseSentryEnvelopeDsn };
