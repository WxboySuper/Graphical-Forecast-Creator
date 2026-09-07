/**
 * Make an authenticated request to the repository's GitHub REST API.
 *
 * @param {string} repository
 * @param {string} token
 * @param {string} path
 * @param {{ method?: string, body?: unknown, allowStatuses?: number[] }} [options]
 */
export async function githubRequest(repository, token, path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    if (options.allowStatuses?.includes(response.status)) {
      return null;
    }
    const text = await response.text();
    throw new Error(`GitHub API ${response.status} for ${path}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
