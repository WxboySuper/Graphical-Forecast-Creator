const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverDirectory = __dirname;
const securityHeaders = fs.readFileSync(path.join(serverDirectory, 'gfc-security-headers.conf'), 'utf8');

for (const filename of ['nginx.conf', 'nginx-staging.conf']) {
  test(`${filename} includes shared headers for server and assets`, () => {
    const config = fs.readFileSync(path.join(serverDirectory, filename), 'utf8');
    assert.equal(config.match(/include \/etc\/nginx\/snippets\/gfc-security-headers\.conf;/g)?.length, 2);
    assert.equal(securityHeaders.match(/^add_header /gm)?.length, 5);
    assert.match(securityHeaders, /default-src 'self'/);
    assert.match(securityHeaders, /script-src 'self'/);
    assert.match(securityHeaders, /object-src 'none'/);
    assert.match(securityHeaders, /frame-ancestors 'none'/);
    assert.match(securityHeaders, /https:\/\/identitytoolkit\.googleapis\.com/);
    assert.match(securityHeaders, /https:\/\/tiles\.openfreemap\.org/);
    assert.match(securityHeaders, /https:\/\/opengeo\.ncep\.noaa\.gov/);
    assert.doesNotMatch(securityHeaders, /report-only/i);
  });
}
