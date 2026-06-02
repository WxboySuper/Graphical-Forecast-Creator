/** @param {string} linkUrl */
export function isSafeBannerLinkUrl(linkUrl) {
  return linkUrl.startsWith('/') || linkUrl.startsWith('https://') || linkUrl.startsWith('http://');
}

/** @param {string | undefined} linkUrl */
export function sanitizeBannerLinkUrl(linkUrl) {
  const trimmed = linkUrl?.trim();
  if (!trimmed || !isSafeBannerLinkUrl(trimmed)) {
    return undefined;
  }
  return trimmed;
}
