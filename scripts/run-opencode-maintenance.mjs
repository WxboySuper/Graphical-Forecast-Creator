import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { modelEnvironment } from './lib/opencode-env.cjs';
import { extractFinalAssistantText, openCodeRunArguments } from './lib/opencode-cli-output.mjs';

const promptPath = process.env.OPENCODE_PROMPT_PATH;
const outputPath = process.env.OPENCODE_OUTPUT_PATH;
const model = process.env.OPENCODE_MODEL;
const responseFormat = process.env.OPENCODE_RESPONSE_FORMAT ?? 'text';
const timeoutMs = Number(process.env.OPENCODE_TIMEOUT_MS ?? 15 * 60 * 1000);

if (!['text', 'json'].includes(responseFormat)) throw new Error('OpenCode response format must be text or json.');

if (!promptPath || !outputPath || !model || !process.env.OPENCODE_API_KEY) {
  throw new Error('OpenCode prompt, output, model, and API key configuration are required.');
}
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 120 * 60 * 1000) {
  throw new Error('OpenCode timeout must be between one minute and two hours.');
}

const prompt = readFileSync(promptPath, 'utf8');
if (!prompt.trim()) throw new Error('OpenCode prompt is empty.');

const env = modelEnvironment(process.env);

const result = spawnSync(
  'opencode',
  openCodeRunArguments(model, prompt),
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
    maxBuffer: 2 * 1024 * 1024,
    timeout: timeoutMs,
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? '');
  throw new Error(`OpenCode exited with status ${result.status ?? 'unknown'}.`);
}

const output = extractFinalAssistantText(result.stdout ?? '', { format: responseFormat });
writeFileSync(outputPath, output, 'utf8');
process.stdout.write(output.slice(0, 12000));
