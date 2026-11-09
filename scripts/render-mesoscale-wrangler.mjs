#!/usr/bin/env node
// Renders cloudflare/wrangler.mesoscale.jsonc with deployment values from the
// environment so the checked-in file can keep inert placeholders.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REQUIRED = ['CLOUDFLARE_ACCOUNT_ID', 'MESOSCALE_R2_BUCKET', 'MESOSCALE_PUBLIC_BASE_URL'];

export function renderMesoscaleWranglerConfig(templateText, env) {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment values: ${missing.join(', ')}`);
  }
  const baseUrl = new URL(env.MESOSCALE_PUBLIC_BASE_URL.trim());
  if (baseUrl.protocol !== 'https:' || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) {
    throw new Error('MESOSCALE_PUBLIC_BASE_URL must be an https origin without a path.');
  }
  const config = JSON.parse(templateText);
  const bucket = env.MESOSCALE_R2_BUCKET.trim();
  config.account_id = env.CLOUDFLARE_ACCOUNT_ID.trim();
  config.r2_buckets = config.r2_buckets.map((entry) => ({
    ...entry,
    bucket_name: bucket,
    preview_bucket_name: bucket,
  }));
  config.vars = { ...config.vars, PUBLIC_BASE_URL: baseUrl.origin };
  return `${JSON.stringify(config, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: render-mesoscale-wrangler.mjs <template> <output>');
    process.exit(2);
  }
  try {
    writeFileSync(output, renderMesoscaleWranglerConfig(readFileSync(input, 'utf8'), process.env));
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
