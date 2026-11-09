import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderMesoscaleWranglerConfig } from './render-mesoscale-wrangler.mjs';

const template = readFileSync(new URL('../cloudflare/wrangler.mesoscale.jsonc', import.meta.url), 'utf8');
const env = {
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  MESOSCALE_R2_BUCKET: 'gfc-mesoscale',
  MESOSCALE_PUBLIC_BASE_URL: 'https://gfc-mesoscale.example.workers.dev',
};

test('fills account, bucket, and public base URL', () => {
  const config = JSON.parse(renderMesoscaleWranglerConfig(template, env));
  assert.equal(config.account_id, env.CLOUDFLARE_ACCOUNT_ID);
  assert.equal(config.r2_buckets[0].bucket_name, 'gfc-mesoscale');
  assert.equal(config.r2_buckets[0].binding, 'MESOSCALE_BUCKET');
  assert.equal(config.vars.PUBLIC_BASE_URL, 'https://gfc-mesoscale.example.workers.dev');
  assert.equal(config.vars.STALE_AFTER_MINUTES, '180');
});

test('requires every deployment value', () => {
  assert.throws(() => renderMesoscaleWranglerConfig(template, { ...env, MESOSCALE_R2_BUCKET: '' }), /MESOSCALE_R2_BUCKET/);
});

test('rejects a base URL that is not a bare https origin', () => {
  for (const url of ['http://x.example', 'https://x.example/path', 'https://x.example/?q=1']) {
    assert.throws(() => renderMesoscaleWranglerConfig(template, { ...env, MESOSCALE_PUBLIC_BASE_URL: url }), /https origin/);
  }
});
