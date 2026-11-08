import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './feedback-worker.mjs';
import { renderViewerPage } from './feedback/viewer-page.mjs';

const html = renderViewerPage('test-nonce');

test('every inline script and style carries the CSP nonce', () => {
  const tags = html.match(/<(script|style)\b[^>]*>/g) ?? [];
  assert.ok(tags.length >= 2, 'page has an inline script and style');
  for (const tag of tags) assert.ok(tag.includes('nonce="test-nonce"'), `nonce missing on ${tag}`);
});

test('the page loads nothing from other origins and has no inline event handlers', () => {
  assert.equal(/(?:src|href|srcset)\s*=\s*["']?\s*(?:https?:|\/\/|data:text\/html|javascript:)/i.test(html), false, 'no external or script-bearing src/href/srcset');
  assert.equal(/@import/i.test(html), false, 'no CSS imports');
  assert.equal(/url\(\s*['"]?\s*(?:https?:|\/\/)/i.test(html), false, 'no external CSS urls');
  assert.equal(/\son[a-z]+\s*=\s*["']/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), false, 'no inline handler attributes in markup');
});

test('feedback text is never inserted as HTML', () => {
  for (const unsafe of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.equal(html.includes(unsafe), false, `page must not use ${unsafe}`);
  }
});

test('mutations carry the same-origin viewer header and the page only talks to /admin/api', () => {
  assert.ok(html.includes("'x-gfc-viewer'"));
  const calls = [...html.matchAll(/['"`](\/[^'"`]*)['"`]/g)].map((match) => match[1]).filter((path) => path.startsWith('/admin'));
  assert.ok(calls.length > 0);
  for (const path of calls) assert.ok(path.startsWith('/admin/api/'), `unexpected path ${path}`);
});

test('only /admin and /admin/* reach the Access-gated viewer', async () => {
  const env = { FEEDBACK_ADMIN_TOKEN: 'secret', FEEDBACK_HASH_SALT: 'salt', FEEDBACK_DB: {}, CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', CF_ACCESS_AUD: 'aud' };
  for (const path of ['/administrator', '/adminx', '/admin-panel']) {
    const response = await worker.fetch(new Request(`https://feedback.gfcweather.com${path}`), env, {});
    assert.equal(response.status, 404, path);
  }
  const gated = await worker.fetch(new Request('https://feedback.gfcweather.com/admin'), env, {});
  assert.equal(gated.status, 401, 'the real /admin path still requires a valid Access token');
});

test('the page ignores stale list responses and serializes status saves', () => {
  assert.ok(html.includes('state.seq'), 'list loads are sequence-guarded');
  assert.ok(html.includes('i.saving'), 'status changes are serialized per item');
  assert.equal(html.includes('state.items.indexOf'), false, 'delete never relies on a stale array index');
});

test('the renderer refuses a nonce that could break out of an attribute or header', () => {
  for (const bad of ['', 'a"b', "a'b", 'a b', 'a;b', '<x>']) assert.throws(() => renderViewerPage(bad), /nonce/i, JSON.stringify(bad));
  assert.doesNotThrow(() => renderViewerPage('aB3-_x'));
});
