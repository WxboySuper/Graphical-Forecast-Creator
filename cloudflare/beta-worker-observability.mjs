import { json, readLimitedBody } from './beta-worker-utils.mjs';
import { parseSentryDsn, parseSentryEnvelopeDsn } from './beta-sentry-utils.mjs';

const MAX_SENTRY_ENVELOPE_BYTES = 100 * 1024;

export async function handleHealthCheck(env) {
  if (!env.DB) return json({ status: 'error', service: 'gfc-beta-worker', database: false }, 503);
  try {
    await env.DB.prepare(`SELECT (SELECT 1 FROM users LIMIT 1) AS users,
      (SELECT 1 FROM user_settings LIMIT 1) AS settings, (SELECT 1 FROM user_entitlements LIMIT 1) AS entitlements,
      (SELECT 1 FROM user_metrics LIMIT 1) AS metrics, (SELECT 1 FROM cloud_cycles LIMIT 1) AS cloud_cycles,
      (SELECT 1 FROM workflow_awareness LIMIT 1) AS awareness, (SELECT 1 FROM custom_products LIMIT 1) AS products,
      (SELECT 1 FROM user_records LIMIT 1) AS records, (SELECT 1 FROM stripe_events LIMIT 1) AS stripe_events`).first();
    return json({ status: 'ok', service: 'gfc-beta-worker', database: true });
  } catch {
    return json({ status: 'error', service: 'gfc-beta-worker', database: false }, 503);
  }
}

export async function handleSentryTunnel(request, env) {
  const envelopeResult = await readSentryTunnelBody(request);
  if (envelopeResult.response) return envelopeResult.response;
  const target = getSentryEnvelopeTarget(env, envelopeResult.envelope);
  if (target.response) return target.response;
  return postSentryEnvelope(target, envelopeResult.envelope);
}

async function readSentryTunnelBody(request) {
  const declaredSize = Number(request.headers.get('Content-Length') || 0);
  if (declaredSize > MAX_SENTRY_ENVELOPE_BYTES) return { response: json({ error: 'Sentry envelope is too large.' }, 413) };
  const envelope = await readLimitedBody(request, MAX_SENTRY_ENVELOPE_BYTES);
  if (!envelope) return { response: json({ error: 'Sentry envelope is too large.' }, 413) };
  if (!envelope.length) return { response: json({ error: 'Invalid Sentry envelope.' }, 400) };
  return { envelope };
}

function getSentryEnvelopeTarget(env, envelope) {
  const configured = parseSentryDsn(env.SENTRY_BROWSER_DSN || env.SENTRY_DSN);
  const incoming = parseSentryEnvelopeDsn(envelope);
  if (!configured || !incoming) return { response: json({ error: 'Invalid Sentry envelope.' }, 400) };
  if (configured.host !== incoming.host || configured.projectId !== incoming.projectId) return { response: json({ error: 'Invalid Sentry envelope.' }, 400) };
  return { host: configured.host, projectId: configured.projectId };
}

function sentryForwardError(error) {
  const aborted = error?.name === 'AbortError';
  return json({ error: aborted ? 'Sentry is temporarily unavailable.' : 'Unable to forward Sentry envelope.' }, aborted ? 504 : 502);
}

async function postSentryEnvelope(target, envelope) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`https://${target.host}/api/${target.projectId}/envelope/`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body: envelope, signal: controller.signal,
    });
    return new Response(null, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return sentryForwardError(error);
  } finally { clearTimeout(timeout); }
}
