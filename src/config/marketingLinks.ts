/**
 * Marketing site links: pricing and release notes live on the public marketing
 * site, not in the app. This module is the single place that knows that origin
 * so in-app links, redirects, and tests agree on it.
 */
export const MARKETING_BASE_URL = 'https://gfcweather.com';

/** Builds an absolute marketing-site URL for a clean path such as `/pricing/`. */
export const marketingUrl = (path: string): string =>
  `${MARKETING_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export const MARKETING_PRICING_URL = marketingUrl('/pricing/');
export const MARKETING_UPDATES_URL = marketingUrl('/updates/');
