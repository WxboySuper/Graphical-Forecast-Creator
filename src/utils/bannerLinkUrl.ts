/**
 * Browsers resolve protocol-relative URLs ("//host" and the backslash variants
 * browsers normalize to slashes) against the page scheme, so they leave the app.
 */
function isProtocolRelative(linkUrl: string): boolean {
  return /^[\\/]{2}/.test(linkUrl);
}

/**
 * True for in-app paths and http(s) external URLs only.
 * Rejects javascript:, data:, protocol-relative, and other non-http(s) schemes.
 */
export function isSafeBannerLinkUrl(linkUrl: string): boolean {
  if (isProtocolRelative(linkUrl)) {
    return false;
  }
  return linkUrl.startsWith('/') || linkUrl.startsWith('https://') || linkUrl.startsWith('http://');
}

/**
 * Drops unsafe schemes (e.g. javascript:) from banner link URLs.
 * Returns undefined when the URL is missing or not allowlisted.
 */
export function sanitizeBannerLinkUrl(linkUrl?: string): string | undefined {
  const trimmed = linkUrl?.trim();
  if (!trimmed || !isSafeBannerLinkUrl(trimmed)) {
    return undefined;
  }
  return trimmed;
}
