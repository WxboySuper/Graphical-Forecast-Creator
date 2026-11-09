/**
 * Starts the mesoscale ingest workflow on a Cloudflare cron schedule. GitHub's own `schedule`
 * trigger is delayed or dropped under load, so this is the primary trigger and the workflow's
 * schedule is only a backup. The workflow is idempotent: a run that finds the newest model cycle
 * already published exits in seconds, so an extra dispatch is harmless.
 *
 * The GitHub token is a Worker secret (GITHUB_DISPATCH_TOKEN): a fine-grained token limited to
 * this repository with only the "Actions: read and write" permission. This Worker serves no
 * requests and is deliberately separate from the public catalog Worker.
 */

const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 15000;

const DEFAULTS = {
  GITHUB_REPOSITORY: 'WxboySuper/Graphical-Forecast-Creator',
  WORKFLOW_FILE: 'mesoscale-ingest.yml',
  WORKFLOW_REF: 'main',
};

const setting = (env, name) => (env[name]?.trim() ? env[name].trim() : DEFAULTS[name]);

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKFLOW_PATTERN = /^[A-Za-z0-9_.-]+\.ya?ml$/;
const REF_PATTERN = /^[A-Za-z0-9_./-]+$/;

/** Builds the workflow dispatch request, or throws when the configuration is unusable. */
export const buildDispatchRequest = (env) => {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) throw new Error('GITHUB_DISPATCH_TOKEN is not set');
  const repository = setting(env, 'GITHUB_REPOSITORY');
  const workflow = setting(env, 'WORKFLOW_FILE');
  const ref = setting(env, 'WORKFLOW_REF');
  if (!REPOSITORY_PATTERN.test(repository) || !WORKFLOW_PATTERN.test(workflow) || !REF_PATTERN.test(ref)) {
    throw new Error('Invalid scheduler configuration');
  }
  return {
    url: `${GITHUB_API}/repos/${repository}/actions/workflows/${workflow}/dispatches`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': 'gfc-mesoscale-scheduler',
      },
      body: JSON.stringify({ ref }),
    },
  };
};

/** Dispatches the workflow once. Never logs the token or the response body beyond a short status. */
export const dispatchIngest = async (env, fetcher = fetch) => {
  const { url, init } = buildDispatchRequest(env);
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status !== 204) {
    throw new Error(`GitHub workflow dispatch failed with HTTP ${response.status}`);
  }
  return { dispatchedAt: new Date().toISOString() };
};

export default {
  async scheduled(_event, env) {
    // Awaited so a missing or rejected token fails the cron invocation visibly in Cloudflare.
    await dispatchIngest(env);
  },
  async fetch() {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  },
};
