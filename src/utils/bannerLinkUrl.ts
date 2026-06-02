/** True for in-app paths and http(s) external URLs only. */
export function isSafeBannerLinkUrl(linkUrl: string): boolean {
  return linkUrl.startsWith('/') || linkUrl.startsWith('https://') || linkUrl.startsWith('http://');
}

/** Drops unsafe schemes (e.g. javascript:) from banner link URLs. */
export function sanitizeBannerLinkUrl(linkUrl?: string): string | undefined {
  const trimmed = linkUrl?.trim();
  if (!trimmed || !isSafeBannerLinkUrl(trimmed)) {
    return undefined;
  }
  return trimmed;
}
