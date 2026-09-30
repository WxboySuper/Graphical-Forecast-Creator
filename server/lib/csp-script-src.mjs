/**
 * Helpers for asserting Content-Security-Policy script-src values in header fixtures.
 */

/** Returns the script-src directive value from a CSP policy string. */
export const getScriptSrcValue = (policy) => {
  const match = policy.match(/(?:^|;)\s*script-src\s+([^;]+)/);
  if (!match) {
    throw new Error('Missing script-src directive in Content-Security-Policy.');
  }

  return match[1].trim();
};

/** Extracts the CSP policy string from a Cloudflare _headers block or nginx snippet. */
export const extractContentSecurityPolicy = (source) => {
  const headersFileMatch = source.match(/Content-Security-Policy:\s*(.+)/);
  if (headersFileMatch) {
    return headersFileMatch[1].trim();
  }

  const nginxMatch = source.match(/Content-Security-Policy\s+"([^"]+)"/);
  if (nginxMatch) {
    return nginxMatch[1];
  }

  throw new Error('Content-Security-Policy not found in header fixture.');
};
