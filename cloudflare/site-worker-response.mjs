export const serviceUnavailable = (error) =>
  Response.json({ error }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

