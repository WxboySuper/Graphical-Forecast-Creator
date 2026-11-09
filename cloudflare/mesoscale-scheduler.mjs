/**
 * The repository's reliable cron. GitHub's own `schedule` trigger is delayed or dropped under
 * load, so Cloudflare cron triggers start the scheduled workflows through the GitHub
 * `workflow_dispatch` API, and the workflows' own schedules are only backups. Each cron expression
 * in `wrangler.mesoscale-scheduler.jsonc` must have an entry in JOBS below.
 *
 * Both jobs are safe to start extra times: the ingest exits in seconds when the newest model cycle
 * is already published, and the beta release exits early when `main` has nothing new.
 *
 * The GitHub token is a Worker secret (GITHUB_DISPATCH_TOKEN): a fine-grained token limited to
 * this repository with only the "Actions: read and write" permission. This Worker serves no
 * requests and is deliberately separate from the public catalog Worker.
 */

const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 15000;

/** Cron expression to the workflows it starts. Inputs are always strings for workflow_dispatch. */
export const JOBS = {
  '12,42 * * * *': [{ workflow: 'mesoscale-ingest.yml' }],
  '23 3,9,15,21 * * *': [
    {
      workflow: 'release-beta.yml',
      inputs: { confirmation: 'RELEASE-BETA', dry_run: 'false', deploy_api: 'true', only_if_changed: 'true' },
    },
  ],
};

const DEFAULTS = {
  GITHUB_REPOSITORY: 'WxboySuper/Graphical-Forecast-Creator',
  WORKFLOW_REF: 'main',
};

/** A trimmed string var, or the default when it is absent, empty, or not a string. */
const setting = (env, name) => {
  const value = typeof env?.[name] === 'string' ? env[name].trim() : '';
  return value || DEFAULTS[name];
};

// Segments start with a letter or digit, so `.`, `..`, and leading dashes can never reach the URL.
const SEGMENT = '[A-Za-z0-9][A-Za-z0-9_.-]*';
const CHECKS = {
  GITHUB_REPOSITORY: new RegExp(`^${SEGMENT}/${SEGMENT}$`),
  WORKFLOW_REF: new RegExp(`^${SEGMENT}(/${SEGMENT})*$`),
};

const isSafeSetting = (name, value) => CHECKS[name].test(value) && !value.includes('..');

const WORKFLOW_FILE = new RegExp(String.raw`^${SEGMENT}\.ya?ml$`);

const isString = (value) => typeof value === 'string';
const isFlatStringMap = (value) => value !== null && typeof value === 'object' && Object.values(value).every(isString);
const hasSafeWorkflow = (job) => isString(job?.workflow) && WORKFLOW_FILE.test(job.workflow);
const hasValidInputs = (job) => job.inputs === undefined || isFlatStringMap(job.inputs);

/** A job must name a safe workflow file; its inputs, when present, must be a flat object of strings. */
const assertJob = (job) => {
  if (!hasSafeWorkflow(job) || !hasValidInputs(job)) throw new Error('Invalid scheduler job');
};

const readToken = (env) => {
  const token = isString(env?.GITHUB_DISPATCH_TOKEN) ? env.GITHUB_DISPATCH_TOKEN.trim() : '';
  if (!token) throw new Error('GITHUB_DISPATCH_TOKEN is not set');
  return token;
};

/** Repository and ref, each validated; an unusable value is a clear configuration error. */
const readSettings = (env) => {
  const values = Object.fromEntries(Object.keys(CHECKS).map((name) => [name, setting(env, name)]));
  const invalid = Object.entries(values).find(([name, value]) => !isSafeSetting(name, value));
  if (invalid) throw new Error(`Invalid scheduler configuration: ${invalid[0]}`);
  return values;
};

const requestInit = (token, body) => ({
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'gfc-scheduler',
  },
  body: JSON.stringify(body),
});

/** Builds the workflow dispatch request for one job, or throws when the configuration is unusable. */
export const buildDispatchRequest = (env, job) => {
  assertJob(job);
  const token = readToken(env);
  const settings = readSettings(env);
  const body = { ref: settings.WORKFLOW_REF, ...(job.inputs ? { inputs: job.inputs } : {}) };
  return {
    url: `${GITHUB_API}/repos/${settings.GITHUB_REPOSITORY}/actions/workflows/${job.workflow}/dispatches`,
    init: requestInit(token, body),
  };
};

/** GitHub's short error message (for example "Bad credentials" or a wrong ref), never the token. */
const errorDetail = async (response) => {
  try {
    const { message } = await response.json();
    return typeof message === 'string' ? `: ${message.slice(0, 160)}` : '';
  } catch {
    return '';
  }
};

/** Starts one workflow. Never logs the token or the response body beyond a short message. */
export const dispatchJob = async (env, job, fetcher = fetch) => {
  const { url, init } = buildDispatchRequest(env, job);
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status !== 204) {
    throw new Error(`Dispatching ${job.workflow} failed with HTTP ${response.status}${await errorDetail(response)}`);
  }
  return { workflow: job.workflow, dispatchedAt: new Date().toISOString() };
};

/** The jobs for a cron expression; an unknown expression is a configuration error, not a no-op. */
export const jobsForCron = (cron) => {
  const jobs = JOBS[cron];
  if (!jobs) throw new Error(`No scheduler job is defined for cron "${cron}"`);
  return jobs;
};

export default {
  async scheduled(event, env) {
    // Awaited so a missing token or a rejected dispatch fails the cron invocation visibly in Cloudflare.
    for (const job of jobsForCron(event?.cron)) await dispatchJob(env, job);
  },
  async fetch() {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  },
};
