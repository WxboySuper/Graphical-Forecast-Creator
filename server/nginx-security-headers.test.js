const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverDirectory = __dirname;
const repoRoot = path.join(serverDirectory, '..');
const securityHeaders = fs.readFileSync(path.join(serverDirectory, 'gfc-security-headers.conf'), 'utf8');
const staticHeaders = fs.readFileSync(path.join(repoRoot, 'public', '_headers'), 'utf8');

const GOOGLE_SIGN_IN_SCRIPT_HOST = 'https://apis.google.com';

test('public/_headers allows Firebase Google Sign-In scripts in script-src', async () => {
  const { extractContentSecurityPolicy, scriptSrcAllowsSource } = await import('./lib/csp-script-src.mjs');
  const policy = extractContentSecurityPolicy(staticHeaders);
  assert.ok(scriptSrcAllowsSource(policy, GOOGLE_SIGN_IN_SCRIPT_HOST));
});

for (const filename of ['nginx.conf', 'nginx-staging.conf']) {
  test(`${filename} includes shared headers for server and assets`, async () => {
    const { extractContentSecurityPolicy, scriptSrcAllowsSource } = await import('./lib/csp-script-src.mjs');
    const config = fs.readFileSync(path.join(serverDirectory, filename), 'utf8');
    assert.equal(config.match(/include \/etc\/nginx\/snippets\/gfc-security-headers\.conf;/g)?.length, 2);
    assert.equal(securityHeaders.match(/^add_header /gm)?.length, 5);
    assert.match(securityHeaders, /default-src 'self'/);
    for (const directive of [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "frame-src 'self'",
      "form-action 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "media-src 'self'",
    ]) {
      assert.ok(securityHeaders.includes(directive), `missing CSP directive fragment: ${directive}`);
    }
    assert.match(securityHeaders, /https:\/\/identitytoolkit\.googleapis\.com/);
    assert.match(securityHeaders, /https:\/\/tiles\.openfreemap\.org/);
    assert.match(securityHeaders, /https:\/\/opengeo\.ncep\.noaa\.gov/);
    assert.match(securityHeaders, /https:\/\/telemetry\.gfc\.weatherboysuper\.com/);
    const nginxPolicy = extractContentSecurityPolicy(securityHeaders);
    assert.ok(scriptSrcAllowsSource(nginxPolicy, GOOGLE_SIGN_IN_SCRIPT_HOST));
    assert.doesNotMatch(securityHeaders, /report-only/i);
  });
}
