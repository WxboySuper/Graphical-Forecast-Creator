#!/usr/bin/env node
/**
 * Checks the mesoscale catalog Worker's /status and fails when a model's feed is unhealthy, so a
 * failed workflow run (which GitHub emails to the repository owner) is the alert. Thresholds are the
 * Worker's own per-model stale limits; this script adds no limits of its own.
 */
import { pathToFileURL } from 'node:url';

const REQUEST_TIMEOUT_MS = 20000;
const HEALTHY_FEEDS = new Set(['complete', 'partial']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const describeModel = (model) => {
  const age = Number.isFinite(model.ageMinutes) ? `${model.ageMinutes} min old` : 'age unknown';
  return `${String(model.modelId).toUpperCase()}: latest cycle ${model.latestCycleTime ?? 'none'} (${age}), feed ${model.health}`;
};

const problemFor = (model) => {
  if (!isRecord(model)) return 'A model entry in /status is not an object.';
  if (model.stale === true) return `${describeModel(model)}; the data is stale.`;
  if (!HEALTHY_FEEDS.has(model.health)) return `${describeModel(model)}; the feed is not healthy.`;
  return null;
};

/** The problems in a /status payload; an empty list means every model is current and its feed is healthy. */
export const evaluateStatus = (status) => {
  if (!isRecord(status) || !Array.isArray(status.models)) return ['/status did not return the expected shape.'];
  if (status.models.length === 0) return ['/status listed no models.'];
  return status.models.map(problemFor).filter(Boolean);
};

/** Fetches /status; throws with a short, safe message when the Worker cannot be reached or read. */
export const fetchStatus = async (baseUrl, fetcher = fetch) => {
  const response = await fetcher(`${baseUrl.replace(/\/+$/, '')}/status`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`/status returned HTTP ${response.status}.`);
  return response.json();
};

const run = async () => {
  const baseUrl = process.env.MESOSCALE_WORKER_URL?.trim();
  if (!baseUrl) {
    console.log('MESOSCALE_WORKER_URL is not set; nothing to check.');
    return;
  }
  let problems;
  try {
    problems = evaluateStatus(await fetchStatus(baseUrl));
  } catch (error) {
    problems = [`Could not read the mesoscale /status: ${error.message}`];
  }
  if (problems.length === 0) {
    console.log('Mesoscale feeds are current and healthy.');
    return;
  }
  for (const problem of problems) console.error(`::error::${problem}`);
  process.exit(1);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
