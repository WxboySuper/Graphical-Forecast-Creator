/**
 * Script test contract for github-paginate.test.
 *
 * This file verifies the script or automation boundary represented by github-paginate.test, including its inputs, outputs, and failure behavior.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchAllPages } from './github-paginate.mjs';

describe('fetchAllPages', () => {
  it('stops after a short final page', () =>
    fetchAllPages((page) => {
      if (page === 1) return Promise.resolve(Array.from({ length: 100 }, (_, i) => i));
      if (page === 2) return Promise.resolve([100, 101]);
      return Promise.resolve([]);
    }).then((pages) => {
      assert.equal(pages.length, 102);
    }));

  it('returns empty when the first page is empty', () =>
    fetchAllPages(() => Promise.resolve([])).then((pages) => {
      assert.deepEqual(pages, []);
    }));
});