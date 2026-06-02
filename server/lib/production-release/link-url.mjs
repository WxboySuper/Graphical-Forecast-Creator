/**
 * True for in-app paths and http(s) external URLs only (blocks javascript: etc.).
 * @param {string} linkUrl
 * @returns {boolean}
 */
export function isSafeBannerLinkUrl(linkUrl) {
  return linkUrl.startsWith('/') || linkUrl.startsWith('https://') || linkUrl.startsWith('http://');
}

/**
 * Returns a safe link URL or undefined when the scheme is not allowed.
 * @param {string | undefined} linkUrl
 * @returns {string | undefined}
 */
export function sanitizeBannerLinkUrl(linkUrl) {
  const trimmed = linkUrl?.trim();
  if (!trimmed || !isSafeBannerLinkUrl(trimmed)) {
    return undefined;
  }
  return trimmed;
}
