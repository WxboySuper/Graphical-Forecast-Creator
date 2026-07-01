'use strict';

const fs = require('fs');
const path = require('path');

const { getServerTarget } = require('./lib/serverTarget');

const DEFAULT_INGESTION_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_BUFFER_HOURS = 2;
const DEFAULT_EXPIRATION_HOURS = 6;
const SUPPORTED_DAYS = [1, 2];
const VALID_PERIODS = ['full', '4hr', '1hr'];

/** Returns true when the period string is a known SPC thunder period. */
const isValidPeriod = (period) => VALID_PERIODS.includes(period);

/** Returns the cache root directory for the given deployment target. */
const cacheDir = (target, env = process.env) =>
  path.join(env.TSTM_CACHE_DIR || path.join(__dirname, 'cache', 'tstm'), target);

/** Returns the cache file path for a specific day and period. */
const cacheFilePath = (target, day, period, env = process.env) =>
  path.join(cacheDir(target, env), `day${day}`, `${period}.json`);

/** Reads cached TSTM data for a target/day/period. Returns null on any error. */
const readCache = (target, day, period, env = process.env) => {
  if (!isValidPeriod(period)) return null;
  const filePath = cacheFilePath(target, day, period, env);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Atomically writes TSTM data to the cache (write-to-temp, then rename). */
const writeCache = (target, day, period, data, env = process.env) => {
  const filePath = cacheFilePath(target, day, period, env);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
};

/** Removes a cache entry. Used only for explicit invalidation. */
const deleteCache = (target, day, period, env = process.env) => {
  const filePath = cacheFilePath(target, day, period, env);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore — file may not exist.
  }
};

/** Returns true when the cached data's valid window has expired. */
const isCacheExpired = (data, now = Date.now(), expirationHours = DEFAULT_EXPIRATION_HOURS) => {
  if (!data?.effectiveEnd) return true;
  try {
    const end = new Date(data.effectiveEnd).getTime();
    return now > end + expirationHours * 60 * 60 * 1000;
  } catch {
    return true;
  }
};

/** Returns true when a generator response indicates the run data is complete and usable. */
const isRunComplete = (result) => {
  if (!result || typeof result !== 'object') return false;
  if (!Array.isArray(result.features) || result.features.length === 0) return false;
  if (result.completeness && result.completeness.complete === false) return false;
  return true;
};

/**
 * Computes candidate ingestion targets based on the current time.
 *
 * HREF runs at 0Z and 12Z.  SPC posts calibrated thunder ~1-3 hours after
 * model init (variable).  The buffer accounts for this delay.
 *
 * Returns an array of { day, period, run } objects to check.
 */
const computeCandidateRuns = (now, bufferHours = DEFAULT_BUFFER_HOURS) => {
  const utcNow = new Date(now);
  const hour = utcNow.getUTCHours();
  const date = utcNow.toISOString().slice(0, 10);
  const candidates = [];

  // Determine which HREF run to check based on current time + buffer.
  // After 0Z + buffer: check 0Z run for Day 1
  // After 12Z + buffer: check 12Z run for Day 1
  // Day 2 always uses the previous 12Z run.
  let day1Run = null;
  let day2Run = null;

  if (hour >= 12 + bufferHours) {
    // After 14Z (default): 12Z run should be posting
    day1Run = `${date}T12:00:00Z`;
    day2Run = `${date}T12:00:00Z`;
  } else if (hour >= bufferHours) {
    // After 02Z (default): 0Z run should be posting
    day1Run = `${date}T00:00:00Z`;
    // Day 2 uses previous day's 12Z
    const prev = new Date(utcNow);
    prev.setUTCDate(prev.getUTCDate() - 1);
    day2Run = `${prev.toISOString().slice(0, 10)}T12:00:00Z`;
  }

  if (day1Run) {
    candidates.push({ day: 1, period: 'full', run: day1Run });
  }
  if (day2Run) {
    candidates.push({ day: 2, period: 'full', run: day2Run });
  }

  return candidates;
};

/**
 * Runs a single ingestion cycle: checks each candidate run, spawns the
 * generator, and only writes to cache when data is confirmed complete.
 */
const runIngestionCycle = async (options = {}) => {
  const {
    env = process.env,
    target = getServerTarget(env),
    runGenerator,
    now = Date.now(),
    bufferHours = DEFAULT_BUFFER_HOURS,
    log = console,
  } = options;

  const candidates = computeCandidateRuns(now, bufferHours);

  for (const { day, period, run } of candidates) {
    const cycleDate = run.slice(0, 10);
    const payload = { day, cycleDate };

    try {
      const result = await runGenerator(payload, { ingestionMode: true });

      if (!isRunComplete(result)) {
        log.info?.(
          `[tstm-ingest] run ${run} day ${day} not ready, retaining cache`
        );
        continue;
      }

      const cacheData = {
        run: result.run,
        day,
        period,
        features: result.features,
        effectiveStart: result.effectiveStart,
        effectiveEnd: result.effectiveEnd,
        thresholds: result.thresholds,
        generatedAt: result.generatedAt,
        ingestedAt: new Date().toISOString(),
        complete: true,
        domain: result.domain || 'conus',
      };

      writeCache(target, day, period, cacheData, env);
      log.info?.(
        `[tstm-ingest] run ${run} day ${day} cached (${result.features.length} features)`
      );
    } catch (err) {
      log.error?.(
        `[tstm-ingest] run ${run} day ${day} failed: ${err.message}`
      );
    }
  }
};

/**
 * Starts the periodic ingestion loop.  Returns a stop function.
 */
const startIngestionLoop = (options = {}) => {
  const {
    env = process.env,
    intervalMs = Number(env.TSTM_INGESTION_INTERVAL_MS) || DEFAULT_INGESTION_INTERVAL_MS,
    runGenerator,
    log = console,
  } = options;

  if (!runGenerator) {
    throw new Error('runGenerator is required to start the ingestion loop');
  }

  let timer = null;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runIngestionCycle({ env, runGenerator, log });
    } finally {
      running = false;
    }
  };

  // Run once immediately, then on interval.
  tick();
  timer = setInterval(tick, intervalMs);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
};

module.exports = {
  cacheDir,
  cacheFilePath,
  computeCandidateRuns,
  deleteCache,
  DEFAULT_BUFFER_HOURS,
  DEFAULT_EXPIRATION_HOURS,
  DEFAULT_INGESTION_INTERVAL_MS,
  isCacheExpired,
  isValidPeriod,
  isRunComplete,
  readCache,
  runIngestionCycle,
  startIngestionLoop,
  SUPPORTED_DAYS,
  VALID_PERIODS,
  writeCache,
};
