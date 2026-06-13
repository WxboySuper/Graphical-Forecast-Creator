'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rateLimit = require('express-rate-limit');

const TSTM_GENERATION_RATE_LIMIT = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many TSTM generation requests right now. Please wait a moment and try again.' },
});

const TSTM_GENERATION_TIMEOUT_MS = Number(process.env.TSTM_GENERATION_TIMEOUT_MS || 480000);
const MAX_STDERR_LENGTH = 2000;

const isSupportedDay = (day) => day === 1 || day === 2;

const createGenerationPayload = (body = {}) => ({
  day: Number(body.day),
  cycleDate: typeof body.cycleDate === 'string' ? body.cycleDate : '',
  issueDate: typeof body.issueDate === 'string' ? body.issueDate : undefined,
  validDate: typeof body.validDate === 'string' ? body.validDate : undefined,
  issuanceTime: typeof body.issuanceTime === 'string' ? body.issuanceTime : undefined,
});

const getDefaultCondaPython = () => {
  if (process.platform !== 'win32') return null;
  const candidates = [
    path.join(os.homedir(), 'miniforge3', 'python.exe'),
    path.join(os.homedir(), 'miniconda3', 'python.exe'),
    path.join(os.homedir(), 'anaconda3', 'python.exe'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const getPythonCommand = () => process.env.PYTHON_BIN || process.env.PYTHON || getDefaultCondaPython() || 'python';

const runHrefTstmGenerator = (payload) =>
  new Promise((resolve, reject) => {
    const script = path.join(__dirname, 'weather', 'generate_tstm.py');
    const child = spawn(getPythonCommand(), [script], {
      cwd: __dirname,
      env: {
        ...process.env,
        HERBIE_DIR: process.env.HERBIE_DIR || path.join(__dirname, 'cache', 'herbie'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let didFinish = false;

    const timeout = setTimeout(() => {
      if (didFinish) return;
      didFinish = true;
      child.kill('SIGTERM');
      reject(new Error('Timed out while generating TSTM lines from SPC calibrated thunder.'));
    }, TSTM_GENERATION_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr = `${stderr}${text}`.slice(-MAX_STDERR_LENGTH);
      text.split(/\r?\n/).filter(Boolean).forEach((line) => {
        console.log(`[tstm:python] ${line}`);
      });
    });

    child.on('error', (error) => {
      if (didFinish) return;
      didFinish = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      if (didFinish) return;
      didFinish = true;
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new Error(stderr || `SPC calibrated thunder generator exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('SPC calibrated thunder generator returned invalid JSON.'));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });

const handleTstmGeneration = async (req, res) => {
  const payload = createGenerationPayload(req.body);

  if (!isSupportedDay(payload.day)) {
    res.status(400).json({ error: 'SPC calibrated thunder generation is only available for Day 1 and Day 2.' });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.cycleDate)) {
    res.status(400).json({ error: 'A valid cycleDate in YYYY-MM-DD format is required.' });
    return;
  }

  const generated = await runHrefTstmGenerator(payload);
  res.json(generated);
};

const registerTstmRoutes = (app, express) => {
  app.post('/api/tstm/generate', TSTM_GENERATION_RATE_LIMIT, express.json({ limit: '4kb' }), async (req, res) => {
    try {
      await handleTstmGeneration(req, res);
    } catch (error) {
      console.error('[tstm] generate:error', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to generate TSTM lines right now.',
      });
    }
  });
};

module.exports = {
  createGenerationPayload,
  isSupportedDay,
  registerTstmRoutes,
};
