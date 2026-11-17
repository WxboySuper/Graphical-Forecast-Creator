export async function takeRateToken(request, env) {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || !env.TELEMETRY_RATE_LIMITER) return true;
  try { return (await env.TELEMETRY_RATE_LIMITER.limit({ key: `${new URL(request.url).pathname}:${ip}` })).success; }
  catch { return true; }
}
