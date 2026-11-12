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

export const secureMarketingResponse = (response, url) => {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'");
  setCachePolicy(headers, response, url.pathname);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
