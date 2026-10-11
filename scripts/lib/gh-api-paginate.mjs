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

/** Build argv for `gh api <route> --method <VERB> [-f key=value...]` (GET list endpoints). */
export function buildGhApiSlurpPaginateArgs(route, { perPage = 100 } = {}) {
  const separator = route.includes('?') ? '&' : '?';
  return ['api', `${route}${separator}per_page=${perPage}`, '--paginate', '--slurp'];
}

/**
 * Build argv for a single `gh api` call. `gh api` takes exactly ONE endpoint
 * argument; the HTTP verb goes behind `--method` (GET is the default).
 * Keeps the method out of the positional args so `gh` never sees
 * `gh api GET <route>` ("accepts 1 arg(s), received 2").
 */
export function buildGhApiArgs(route, fields = {}, method = 'GET') {
  const args = ['api', '--method', method, route];
  for (const [key, value] of Object.entries(fields)) {
    args.push('-f', `${key}=${value}`);
  }
  return args;
}
