/**
 * True for in-app paths and http(s) external URLs only.
 * Rejects javascript:, data:, and other non-http(s) schemes.
 */
export function isSafeBannerLinkUrl(linkUrl: string): boolean {
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
