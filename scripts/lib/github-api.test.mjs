import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { githubRequest } from './github-api.mjs';

/** Build the minimal response shape needed by the request helper tests. */
const response = ({ ok, status, json = {}, text = '' }) => ({
  ok,
  status,
  json: () => Promise.resolve(json),
  text: () => Promise.resolve(text),
});

describe('githubRequest', () => {
  it('sends the shared authenticated request shape and parses JSON', () => {
    const originalFetch = globalThis.fetch;
    let request = null;
    globalThis.fetch = (url, options) => {
      request = { url, options };
      return Promise.resolve(response({ ok: true, status: 200, json: { id: 7 } }));
    };

    return githubRequest('owner/repo', 'token', '/issues', {
        method: 'POST',
        body: { body: 'hello' },
      })
      .then((result) => {
      assert.deepEqual(result, { id: 7 });
      assert.equal(request.url, 'https://api.github.com/repos/owner/repo/issues');
      assert.equal(request.options.method, 'POST');
      assert.equal(request.options.headers.Authorization, 'Bearer token');
      assert.equal(request.options.headers['X-GitHub-Api-Version'], '2022-11-28');
      assert.equal(request.options.body, '{"body":"hello"}');
      })
      .finally(() => {
      globalThis.fetch = originalFetch;
      });
  });

  it('returns null for no-content and allowed error statuses', () => {
    const originalFetch = globalThis.fetch;
    const responses = [
      response({ ok: true, status: 204 }),
      response({ ok: false, status: 404, text: 'missing' }),
    ];
    globalThis.fetch = () => Promise.resolve(responses.shift());

    return githubRequest('owner/repo', 'token', '/delete')
      .then((result) => {
        assert.equal(result, null);
        return githubRequest('owner/repo', 'token', '/missing', { allowStatuses: [404] });
      })
      .then((result) => {
        assert.equal(result, null);
      })
      .finally(() => {
      globalThis.fetch = originalFetch;
      });
  });

  it('includes the status, path, and response text for unexpected errors', () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(response({ ok: false, status: 500, text: 'server down' }));

    return assert.rejects(
        githubRequest('owner/repo', 'token', '/issues', {}),
        /GitHub API 500 for \/issues: server down/,
      )
      .finally(() => {
      globalThis.fetch = originalFetch;
      });
  });
});
