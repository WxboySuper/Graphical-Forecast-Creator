import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchAllPages } from './github-paginate.mjs';

describe('fetchAllPages', () => {
  it('stops after a short final page', async () => {
    const pages = await fetchAllPages(async (page) => {
      if (page === 1) return Array.from({ length: 100 }, (_, i) => i);
      if (page === 2) return [100, 101];
      return [];
    });
    assert.equal(pages.length, 102);
  });

  it('returns empty when the first page is empty', async () => {
    const pages = await fetchAllPages(async () => []);
    assert.deepEqual(pages, []);
  });
});
