/**
 * Escape regex metacharacters in a literal path segment.
 *
 * @param {string} segment
 */
export const escapeRegex = (segment) => segment.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

/**
 * Build a regex body where * matches one path segment (no slashes).
 *
 * @param {string} pattern
 */
export const globToRegexBody = (pattern) => pattern.split('*').map(escapeRegex).join('[^/]*');

/**
 * Match a repository path against a simple glob (star, double-star-slash prefix, trailing-slash-star suffix).
 *
 * @param {string} file
 * @param {string} pattern
 */
export const pathMatches = (file, pattern) => {
  if (pattern.endsWith('/**')) {
    const dir = pattern.slice(0, -3);
    if (dir.includes('*')) {
      return new RegExp(`^${globToRegexBody(dir)}(/|$)`).test(file);
    }
    return file === dir || file.startsWith(`${dir}/`);
  }

  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3);
    return new RegExp(`${globToRegexBody(suffix)}$`).test(file);
  }

  return new RegExp(`^${globToRegexBody(pattern)}$`).test(file);
};

/**
 * @param {string[]} changedFiles
 * @param {string} pattern
 */
export const anyFileMatches = (changedFiles, pattern) =>
  changedFiles.some((file) => pathMatches(file, pattern));
