'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 480000;
const MAX_STDERR_LENGTH = 2000;
const MAX_STDOUT_LENGTH = 4 * 1024 * 1024;

/** Returns true only when the experimental generator is explicitly enabled. */
const isTstmGenerationEnabled = (env = process.env) => env.TSTM_GENERATION_ENABLED === 'true';

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
  const child = spawnProcess(getPythonCommand(env), [script], {
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
  app.post('/api/tstm/generate', generationLimiter, express.json({ limit: '4kb' }), async (req, res) => {
    if (!isTstmGenerationEnabled(env)) {
      res.status(404).json({ error: 'Auto-TSTM is not enabled on this deployment.' });
      return;
    }
    const payload = createGenerationPayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    try {
      res.json(await runGenerator(payload));
    } catch {
      res.status(503).json({ error: 'Auto-TSTM guidance is temporarily unavailable.' });
    }
  });
};

module.exports = {
  createGenerationPayload,
  isSupportedDay,
  isTstmGenerationEnabled,
  registerTstmRoutes,
  runTstmGenerator,
  validatePayload,
};
