import assert from 'node:assert/strict';
import test from 'node:test';
import { renderViewerPage } from './feedback/viewer-page.mjs';

const html = renderViewerPage('test-nonce');

test('every inline script and style carries the CSP nonce', () => {
  const tags = html.match(/<(script|style)\b[^>]*>/g) ?? [];
  assert.ok(tags.length >= 2, 'page has an inline script and style');
  for (const tag of tags) assert.ok(tag.includes('nonce="test-nonce"'), `nonce missing on ${tag}`);
});

test('the page loads nothing from other origins and has no inline event handlers', () => {
  assert.equal(/(?:src|href)\s*=\s*"https?:/i.test(html), false, 'no external src/href');
  assert.equal(/url\(\s*['"]?https?:/i.test(html), false, 'no external CSS urls');
  assert.equal(/\son[a-z]+\s*=\s*"/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), false, 'no inline handler attributes in markup');
});

test('feedback text is never inserted as HTML', () => {
  for (const unsafe of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
    assert.equal(html.includes(unsafe), false, `page must not use ${unsafe}`);
  }
});

test('mutations carry the same-origin viewer header and the page only talks to /admin/api', () => {
  assert.ok(html.includes("'x-gfc-viewer'"));
  const calls = [...html.matchAll(/'(\/[^']*)'/g)].map((match) => match[1]).filter((path) => path.startsWith('/admin'));
  assert.ok(calls.length > 0);
  for (const path of calls) assert.ok(path.startsWith('/admin/api/'), `unexpected path ${path}`);
});
