/**
 * Per-route, per-IP throttle. It deliberately fails open: telemetry is best effort, so a missing IP
 * (local or non-Cloudflare traffic), an unbound limiter, or a limiter error must never turn into
 * refused requests. Real traffic always carries cf-connecting-ip, so abuse protection still applies.
 */
export async function takeRateToken(request, env) {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || !env.TELEMETRY_RATE_LIMITER) return true;
  try { return (await env.TELEMETRY_RATE_LIMITER.limit({ key: `${new URL(request.url).pathname}:${ip}` })).success; }
  catch { return true; }
}
