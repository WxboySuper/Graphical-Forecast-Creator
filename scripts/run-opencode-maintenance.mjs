import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const promptPath = process.env.OPENCODE_PROMPT_PATH;
const outputPath = process.env.OPENCODE_OUTPUT_PATH;
const model = process.env.OPENCODE_MODEL;

if (!promptPath || !outputPath || !model || !process.env.OPENCODE_API_KEY) {
  throw new Error('OpenCode prompt, output, model, and API key configuration are required.');
}

const prompt = readFileSync(promptPath, 'utf8');
if (!prompt.trim()) throw new Error('OpenCode prompt is empty.');

const env = { ...process.env };
for (const name of [
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
]) delete env[name];

const result = spawnSync(
  'opencode',
  ['run', '--model', model, '--auto', prompt],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? '');
  throw new Error(`OpenCode exited with status ${result.status ?? 'unknown'}.`);
}

const output = (result.stdout ?? '').trim();
if (!output) throw new Error('OpenCode returned no output.');
writeFileSync(outputPath, output, 'utf8');
process.stdout.write(output.slice(0, 12000));
