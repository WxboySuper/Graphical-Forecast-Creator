const isHtmlResponse = (response, pathname) => {
  if (response.status === 404) return true;
  if (response.headers.get('content-type')?.includes('text/html')) return true;
  if (pathname.endsWith('.html')) return true;
  return pathname === '/';
};

const isHashedAsset = (pathname) => /[-.][a-z0-9_-]{8,}\.[^/]+$/i.test(pathname);

const setCachePolicy = (headers, response, pathname) => {
  if (isHtmlResponse(response, pathname)) {
    headers.set('Cache-Control', 'public, max-age=300');
    return;
  }
  if (isHashedAsset(pathname)) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
};

const isNullBodyStatus = (status) => status === 204 || status === 205 || status === 304;
const hasValidStatusText = (statusText) => /^[\t\x20-\x7e\x80-\xff]*$/.test(statusText);

export const secureMarketingResponse = (response, url) => {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'");
  setCachePolicy(headers, response, url.pathname);
  const statusText = hasValidStatusText(response.statusText) ? response.statusText : undefined;
  const body = isNullBodyStatus(response.status) ? null : response.body;
  return new Response(body, { status: response.status, statusText, headers });
};
