import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { githubRequest } from './github-api.mjs';
import { GITHUB_PAGE_SIZE } from './github-paginate.mjs';
import { upsertPromotionExposureComment } from './pr-exposure-comment.mjs';
import { githubRequest as staleBranchGithubRequest } from './stale-branch-github.mjs';

/** Build the minimal response shape needed by the request helper tests. */
const response = ({ ok, status, json = {}, text = '' }) => ({
  ok,
  status,
  json: () => Promise.resolve(json),
  text: () => Promise.resolve(text),
});

/**
 * Serve queued responses in order and record every request. A request past the
 * end of the queue throws, so a test cannot finish by exhausting its fixtures.
 *
 * @param {object[]} queued
 */
function mockFetchQueue(queued) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = (url, options) => {
    const next = queued.shift();
    if (!next) {
      throw new Error(`fetch called with no queued response: ${options?.method} ${url}`);
    }
    requests.push({ url, options });
    return Promise.resolve(next);
  };

  return {
    requests,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

describe('githubRequest', () => {
  it('preserves the stale-branch module export', () => {
    assert.equal(staleBranchGithubRequest, githubRequest);
  });

  it('sends the shared authenticated request shape and parses JSON', async () => {
    const fetchMock = mockFetchQueue([response({ ok: true, status: 200, json: { id: 7 } })]);

    try {
      const result = await githubRequest('owner/repo', 'token', '/issues', {
        method: 'POST',
        body: { body: 'hello' },
      });

      assert.deepStrictEqual(result, { id: 7 });
      assert.equal(fetchMock.requests.length, 1);

      const [request] = fetchMock.requests;
      assert.equal(request.url, 'https://api.github.com/repos/owner/repo/issues');
      assert.equal(request.options.method, 'POST');
      assert.equal(request.options.headers.Accept, 'application/vnd.github+json');
      assert.equal(request.options.headers['Content-Type'], 'application/json');
      assert.equal(request.options.headers.Authorization, 'Bearer token');
      assert.equal(request.options.headers['X-GitHub-Api-Version'], '2022-11-28');
      assert.equal(request.options.body, '{"body":"hello"}');
    } finally {
      fetchMock.restore();
    }
  });

  it('returns null for no-content and allowed error statuses', async () => {
    const fetchMock = mockFetchQueue([
      response({ ok: true, status: 204 }),
      response({ ok: false, status: 404, text: 'missing' }),
    ]);

    try {
      assert.equal(await githubRequest('owner/repo', 'token', '/delete'), null);
      assert.equal(
        await githubRequest('owner/repo', 'token', '/missing', { allowStatuses: [404] }),
        null
      );
      assert.equal(fetchMock.requests.length, 2);
    } finally {
      fetchMock.restore();
    }
  });

  it('includes the status, path, and response text for unexpected errors', async () => {
    const fetchMock = mockFetchQueue([response({ ok: false, status: 500, text: 'server down' })]);

    try {
      await assert.rejects(
        githubRequest('owner/repo', 'token', '/issues', {}),
        /GitHub API 500 for \/issues: server down/
      );
      assert.equal(fetchMock.requests.length, 1);
    } finally {
      fetchMock.restore();
    }
  });
});

describe('upsertPromotionExposureComment', () => {
  it('lists existing comments before creating a report comment', async () => {
    const fetchMock = mockFetchQueue([
      response({ ok: true, status: 200, json: [] }),
      response({ ok: true, status: 201, json: { id: 88 } }),
    ]);

    try {
      const result = await upsertPromotionExposureComment({
        repository: 'owner/repo',
        token: 'token',
        prNumber: 42,
        body: 'exposure report',
      });

      assert.deepStrictEqual(result, { action: 'created', commentId: 88 });
      assert.equal(fetchMock.requests.length, 2);

      const [list, create] = fetchMock.requests;
      assert.equal(
        list.url,
        `https://api.github.com/repos/owner/repo/issues/42/comments?per_page=${GITHUB_PAGE_SIZE}&page=1`
      );
      assert.equal(list.options.method, 'GET');
      assert.equal(list.options.body, undefined);

      assert.equal(create.url, 'https://api.github.com/repos/owner/repo/issues/42/comments');
      assert.equal(create.options.method, 'POST');
      assert.deepStrictEqual(JSON.parse(create.options.body), { body: 'exposure report' });
    } finally {
      fetchMock.restore();
    }
  });
});
