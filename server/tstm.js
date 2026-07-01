'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createServerCapabilityGate, isServerCapabilityEnabled } = require('./lib/featureCapabilities');
const { sendTstmApiError, TSTM_ERROR_REASON } = require('./lib/tstmApiErrors');
const {
  getTstmCacheHealth,
  isCacheExpired,
  isValidPeriod,
  readCacheState,
  startIngestionLoop,
} = require('./tstm-ingestion');

const DEFAULT_TIMEOUT_MS = 480000;
const MAX_STDERR_LENGTH = 2000;
const MAX_STDOUT_LENGTH = 4 * 1024 * 1024;
const TSTM_CAPABILITY_KEY = 'TSTM_GENERATION_ENABLED';
const TSTM_READ_RATE_LIMIT_MAX = 120;

/** Creates the shared read rate limiter for cached Auto-TSTM GET routes. */
const createTstmReadRateLimit = (rateLimit, options = {}) => rateLimit({
  windowMs: 60 * 1000,
  max: options.max ?? TSTM_READ_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Returns true when Auto-TSTM is exposed on this deployment target and capability env. */
const isTstmGenerationEnabled = (env = process.env, options = {}) =>
  isServerCapabilityEnabled(TSTM_CAPABILITY_KEY, { env, ...options });

/**
 * Returns true for the only outlook days covered by the preserved generator.
 * Day 1: issuance time through next 12Z.  Day 2: 12Z-to-12Z one day out.
 * SPC calibrated HREF thunder data is only available for these two windows.
 */
const isSupportedDay = (day) => day === 1 || day === 2;

/** Normalizes the request payload passed to the Python process. */
const createGenerationPayload = (body = {}) => ({
  day: Number(body.day),
  cycleDate: typeof body.cycleDate === 'string' ? body.cycleDate : '',
  issueDate: typeof body.issueDate === 'string' ? body.issueDate : undefined,
  validDate: typeof body.validDate === 'string' ? body.validDate : undefined,
  issuanceTime: typeof body.issuanceTime === 'string' ? body.issuanceTime : undefined,
});
// Thresholds are not accepted from the client; the Python generator uses its
// own DEFAULT_THRESHOLDS (core=0.30, support=0.10) and echoes them in the
// response so the client can display the exact values used.

/** Finds a common local Conda Python on Windows. */
const getDefaultCondaPython = () => {
  if (process.platform !== 'win32') return null;
  const candidates = ['miniforge3', 'miniconda3', 'anaconda3']
    .map((folder) => path.join(os.homedir(), folder, 'python.exe'));
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

/** Resolves the Python executable used by the experimental worker. */
const getPythonCommand = (env = process.env) => (
  env.PYTHON_BIN || env.PYTHON || getDefaultCondaPython() || 'python'
);

/** Executes the preserved GRIB2 generator while the capability is enabled. */
const runTstmGenerator = (payload, options = {}) => new Promise((resolve, reject) => {
  const env = options.env || process.env;
  const spawnProcess = options.spawnProcess || spawn;
  const timeoutMs = Number(env.TSTM_GENERATION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const script = path.join(__dirname, 'weather', 'generate_tstm.py');
  const args = [script];
  if (options.ingestionMode) {
    args.push('--ingestion-mode');
  }
  const child = spawnProcess(getPythonCommand(env), args, {
    cwd: __dirname,
    env: {
      ...env,
      HERBIE_DIR: env.HERBIE_DIR || path.join(__dirname, 'cache', 'herbie'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  const state = { finished: false, timer: null };
  /** Settles the worker exactly once and clears its timeout. */
  function finish(callback) {
    if (state.finished) return;
    state.finished = true;
    clearTimeout(state.timer);
    callback();
  }
  state.timer = setTimeout(() => {
    child.kill('SIGTERM');
    finish(() => reject(new Error('TSTM_GENERATION_TIMEOUT')));
  }, timeoutMs);

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    if (stdout.length > MAX_STDOUT_LENGTH) {
      child.kill('SIGTERM');
      finish(() => reject(new Error('TSTM_GENERATOR_OUTPUT_TOO_LARGE')));
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-MAX_STDERR_LENGTH);
  });
  child.on('error', (error) => finish(() => reject(error)));
  child.stdin.on('error', () => {
    // Process failures are settled by the child error/close handlers.
  });
  child.on('close', (code) => finish(() => {
    if (code !== 0) {
      reject(new Error(stderr || `TSTM_GENERATOR_EXIT_${code}`));
      return;
    }
    try {
      resolve(JSON.parse(stdout));
    } catch {
      reject(new Error('TSTM_GENERATOR_INVALID_JSON'));
    }
  }));
  child.stdin.end(JSON.stringify(payload));
});

/** Validates a request before any process can be started. */
const validatePayload = (payload) => {
  if (!isSupportedDay(payload.day)) {
    return 'SPC calibrated thunder generation is only available for Day 1 and Day 2.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.cycleDate)) {
    return 'A valid cycleDate in YYYY-MM-DD format is required.';
  }
  return null;
};

/** Handles GET /api/tstm/latest — serves pre-cached ingestion data. */
const handleLatestRequest = (env, target) => (req, res) => {
  const day = Number(req.query.day);
  if (!isSupportedDay(day)) {
    res.status(400).json({ error: 'day must be 1 or 2.' });
    return;
  }
  const period = typeof req.query.period === 'string' ? req.query.period : 'full';
  if (!isValidPeriod(period)) {
    res.status(400).json({ error: 'period must be full, 4hr, or 1hr.' });
    return;
  }
  const entry = readCacheState(target, day, period, env);
  if (entry.state === 'miss') {
    sendTstmApiError(
      res,
      404,
      'No cached TSTM data available.',
      TSTM_ERROR_REASON.CACHE_MISS,
    );
    return;
  }
  if (entry.state === 'corrupt') {
    sendTstmApiError(
      res,
      404,
      'Cached TSTM data is unavailable.',
      TSTM_ERROR_REASON.CACHE_CORRUPT,
    );
    return;
  }
  const cached = entry.data;
  if (isCacheExpired(cached)) {
    sendTstmApiError(
      res,
      404,
      'Cached TSTM data has expired.',
      TSTM_ERROR_REASON.CACHE_STALE,
    );
    return;
  }
  res.json(cached);
};

/** Handles GET /api/tstm/status — public operational cache health. */
const handleStatusRequest = (env, target) => (_req, res) => {
  res.json(getTstmCacheHealth(target, env));
};

/** Registers the preserved endpoint in a fail-closed, default-off state. */
const registerTstmRoutes = (app, express, options = {}) => {
  const env = options.env || process.env;
  const runGenerator = options.runGenerator || runTstmGenerator;
  const rateLimit = options.rateLimit || require('express-rate-limit');
  const generationLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 2,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const readLimiter = options.readRateLimit || createTstmReadRateLimit(rateLimit, options.readRateLimitOptions);
  const capabilityOptions = {
    env,
    exposureOverride: options.exposureOverride,
    target: options.target,
  };
  app.post(
    '/api/tstm/generate',
    createServerCapabilityGate(TSTM_CAPABILITY_KEY, capabilityOptions),
    generationLimiter,
    express.json({ limit: '4kb' }),
    async (req, res) => {
      const payload = createGenerationPayload(req.body);
      const validationError = validatePayload(payload);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }
      try {
        res.json(await runGenerator(payload));
      } catch {
        sendTstmApiError(
          res,
          503,
          'Auto-TSTM guidance is temporarily unavailable.',
          TSTM_ERROR_REASON.UNAVAILABLE,
        );
      }
    },
  );

  const { getServerTarget: getTarget } = require('./lib/serverTarget');
  const target = options.target || getTarget(env);
  app.get(
    '/api/tstm/latest',
    createServerCapabilityGate(TSTM_CAPABILITY_KEY, capabilityOptions),
    readLimiter,
    handleLatestRequest(env, target),
  );
  app.get(
    '/api/tstm/status',
    createServerCapabilityGate(TSTM_CAPABILITY_KEY, capabilityOptions),
    readLimiter,
    handleStatusRequest(env, target),
  );
};

/**
 * Starts the scheduled TSTM ingestion loop.  Only runs when
 * TSTM_INGESTION_ENABLED=true and the capability gate allows it.
 */
const registerTstmIngestion = (app, express, options = {}) => {
  const env = options.env || process.env;
  if (env.TSTM_INGESTION_ENABLED !== 'true') return null;
  if (!isTstmGenerationEnabled(env, options)) return null;

  const runGenerator = options.runGenerator || runTstmGenerator;
  const log = options.log || console;
  return startIngestionLoop({ env, runGenerator, log });
};

module.exports = {
  createGenerationPayload,
  createTstmReadRateLimit,
  handleLatestRequest,
  handleStatusRequest,
  isSupportedDay,
  isTstmGenerationEnabled,
  registerTstmIngestion,
  registerTstmRoutes,
  runTstmGenerator,
  TSTM_READ_RATE_LIMIT_MAX,
  validatePayload,
};
