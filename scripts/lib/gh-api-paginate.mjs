/** Parse JSON from `gh api --paginate --slurp` into a single flattened list. */
export function parseGhApiPaginatedResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('GitHub API response was not valid JSON.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('GitHub API paginated response must be a JSON array.');
  }
  if (parsed.length === 0) return [];
  if (Array.isArray(parsed[0])) return parsed.flat();
  return parsed;
}

/** Build argv for `gh api <route>?per_page=N --paginate --slurp` (GET list endpoints). */
export function buildGhApiSlurpPaginateArgs(route, { perPage = 100 } = {}) {
  const separator = route.includes('?') ? '&' : '?';
  return ['api', `${route}${separator}per_page=${perPage}`, '--paginate', '--slurp'];
}
