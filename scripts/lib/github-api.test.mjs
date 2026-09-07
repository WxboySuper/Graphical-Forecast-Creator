import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { githubRequest } from './github-api.mjs';

const response = ({ ok, status, json = {}, text = '' }) => ({
  ok,
  status,
  json: async () => json,
  text: async () => text,
});

describe('githubRequest', () => {
  it('sends the shared authenticated request shape and parses JSON', async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return response({ ok: true, status: 200, json: { id: 7 } });
    };

    try {
      const result = await githubRequest('owner/repo', 'token', '/issues', {
        method: 'POST',
        body: { body: 'hello' },
      });
      assert.deepEqual(result, { id: 7 });
      assert.equal(request.url, 'https://api.github.com/repos/owner/repo/issues');
      assert.equal(request.options.method, 'POST');
      assert.equal(request.options.headers.Authorization, 'Bearer token');
      assert.equal(request.options.headers['X-GitHub-Api-Version'], '2022-11-28');
      assert.equal(request.options.body, '{"body":"hello"}');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns null for no-content and allowed error statuses', async () => {
    const originalFetch = globalThis.fetch;
    const responses = [
      response({ ok: true, status: 204 }),
      response({ ok: false, status: 404, text: 'missing' }),
    ];
    globalThis.fetch = async () => responses.shift();

    try {
      assert.equal(await githubRequest('owner/repo', 'token', '/delete'), null);
      assert.equal(
        await githubRequest('owner/repo', 'token', '/missing', { allowStatuses: [404] }),
        null,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('includes the status, path, and response text for unexpected errors', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => response({ ok: false, status: 500, text: 'server down' });

    try {
      await assert.rejects(
        githubRequest('owner/repo', 'token', '/issues', {}),
        /GitHub API 500 for \/issues: server down/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
