'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  cacheFilePath,
  computeCandidateRuns,
  deleteCache,
  isCacheExpired,
  isRunComplete,
  readCache,
  runIngestionCycle,
  startIngestionLoop,
  writeCache,
} = require('./tstm-ingestion');

/** Returns a temporary directory for test cache isolation. */
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tstm-ingest-test-'));

const SAMPLE_CACHE_DATA = {
  run: '2026-06-13T12:00:00Z',
  day: 1,
  period: 'full',
  features: [
    {
      type: 'Feature',
      id: 'href-tstm-0',
      geometry: { type: 'Polygon', coordinates: [[[-100, 30], [-99, 30], [-99, 31], [-100, 31], [-100, 30]]] },
      properties: { outlookType: 'categorical', probability: 'TSTM' },
    },
  ],
  effectiveStart: '2026-06-13T06:00:00Z',
  effectiveEnd: '2026-06-14T12:00:00Z',
  thresholds: { calibratedThunderCoreProbability: 0.30, calibratedThunderSupportProbability: 0.10 },
  generatedAt: '2026-06-13T14:05:00Z',
  ingestedAt: '2026-06-13T14:05:12Z',
  complete: true,
};

describe('tstm-ingestion', () => {
  describe('isRunComplete', () => {
    it('returns true for a valid response with features', () => {
      assert.equal(isRunComplete(SAMPLE_CACHE_DATA), true);
    });

    it('returns false for null', () => {
      assert.equal(isRunComplete(null), false);
    });

    it('returns false for empty features', () => {
      assert.equal(isRunComplete({ features: [] }), false);
    });

    it('returns false when completeness.complete is false', () => {
      assert.equal(
        isRunComplete({ features: [{}], completeness: { complete: false } }),
        false
      );
    });

    it('returns true when completeness.complete is true', () => {
      assert.equal(
        isRunComplete({ features: [{}], completeness: { complete: true } }),
        true
      );
    });

    it('returns false for non-object input', () => {
      assert.equal(isRunComplete('not an object'), false);
      assert.equal(isRunComplete(42), false);
    });
  });

  describe('isCacheExpired', () => {
    it('returns false when effectiveEnd is in the future', () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      assert.equal(isCacheExpired({ effectiveEnd: future }), false);
    });

    it('returns true when effectiveEnd is in the past beyond TTL', () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      assert.equal(isCacheExpired({ effectiveEnd: past }), true);
    });

    it('returns false when within TTL after effectiveEnd', () => {
      const recentPast = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      assert.equal(isCacheExpired({ effectiveEnd: recentPast }, Date.now(), 6), false);
    });

    it('returns true when effectiveEnd is missing', () => {
      assert.equal(isCacheExpired({}), true);
    });

    it('returns true for null data', () => {
      assert.equal(isCacheExpired(null), true);
    });
  });

  describe('computeCandidateRuns', () => {
    it('returns day 1 and day 2 after 12Z + buffer', () => {
      // 15:00 UTC on 2026-06-15
      const now = new Date('2026-06-15T15:00:00Z').getTime();
      const candidates = computeCandidateRuns(now, 2);
      assert.equal(candidates.length, 2);
      assert.equal(candidates[0].day, 1);
      assert.equal(candidates[0].run, '2026-06-15T12:00:00Z');
      assert.equal(candidates[1].day, 2);
      assert.equal(candidates[1].run, '2026-06-15T12:00:00Z');
    });

    it('returns day 1 (0Z) and day 2 (prev 12Z) after 0Z + buffer', () => {
      // 05:00 UTC on 2026-06-15
      const now = new Date('2026-06-15T05:00:00Z').getTime();
      const candidates = computeCandidateRuns(now, 2);
      assert.equal(candidates.length, 2);
      assert.equal(candidates[0].day, 1);
      assert.equal(candidates[0].run, '2026-06-15T00:00:00Z');
      assert.equal(candidates[1].day, 2);
      assert.equal(candidates[1].run, '2026-06-14T12:00:00Z');
    });

    it('returns empty before buffer window opens', () => {
      // 00:30 UTC — before 0Z + 2h buffer
      const now = new Date('2026-06-15T00:30:00Z').getTime();
      const candidates = computeCandidateRuns(now, 2);
      assert.equal(candidates.length, 0);
    });
  });

  describe('cache read/write', () => {
    let dir;
    beforeEach(() => { dir = tmpDir(); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('writes and reads a cache file', () => {
      const env = { TSTM_CACHE_DIR: dir };
      writeCache({ target: 'beta', day: 1, period: 'full', data: SAMPLE_CACHE_DATA, env });
      const data = readCache('beta', 1, 'full', env);
      assert.deepEqual(data, SAMPLE_CACHE_DATA);
    });

    it('returns null when reading non-existent cache', () => {
      const env = { TSTM_CACHE_DIR: dir };
      assert.equal(readCache('beta', 1, 'full', env), null);
    });

    it('deletes a cache file', () => {
      const env = { TSTM_CACHE_DIR: dir };
      writeCache({ target: 'beta', day: 1, period: 'full', data: SAMPLE_CACHE_DATA, env });
      deleteCache('beta', 1, 'full', env);
      assert.equal(readCache('beta', 1, 'full', env), null);
    });

    it('delete is idempotent for missing files', () => {
      const env = { TSTM_CACHE_DIR: dir };
      deleteCache('beta', 1, 'full', env);
    });

    it('keeps beta and production cache independent', () => {
      const env = { TSTM_CACHE_DIR: dir };
      writeCache({ target: 'beta', day: 1, period: 'full', data: SAMPLE_CACHE_DATA, env });
      const prodData = { ...SAMPLE_CACHE_DATA, run: '2026-06-14T00:00:00Z' };
      writeCache({ target: 'production', day: 1, period: 'full', data: prodData, env });
      assert.equal(readCache('beta', 1, 'full', env).run, '2026-06-13T12:00:00Z');
      assert.equal(readCache('production', 1, 'full', env).run, '2026-06-14T00:00:00Z');
    });
  });

  describe('runIngestionCycle', () => {
    let dir;
    beforeEach(() => { dir = tmpDir(); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('writes cache when generator returns complete data', async () => {
      const env = { TSTM_CACHE_DIR: dir, TSTM_INGESTION_INTERVAL_MS: '60000' };
      const runGenerator = async () => ({
        ...SAMPLE_CACHE_DATA,
        completeness: { complete: true, checkedHours: [1, 24], matchedHours: [1, 24], missingHours: [] },
      });

      await runIngestionCycle({
        env,
        target: 'beta',
        runGenerator,
        now: new Date('2026-06-15T15:00:00Z').getTime(),
      });

      const cached = readCache('beta', 1, 'full', env);
      assert.ok(cached);
      assert.equal(cached.complete, true);
      assert.equal(cached.features.length, 1);
    });

    it('passes full run timestamp as cycleRun to generator', async () => {
      const env = { TSTM_CACHE_DIR: dir, TSTM_INGESTION_INTERVAL_MS: '60000' };
      let receivedPayload;
      const runGenerator = async (payload) => {
        receivedPayload = payload;
        return { ...SAMPLE_CACHE_DATA, completeness: { complete: true, checkedHours: [1, 24], matchedHours: [1, 24], missingHours: [] } };
      };

      await runIngestionCycle({
        env,
        target: 'beta',
        runGenerator,
        now: new Date('2026-06-15T15:00:00Z').getTime(),
      });

      assert.ok(receivedPayload);
      assert.equal(receivedPayload.cycleRun, '2026-06-15T12:00:00Z');
      assert.equal(receivedPayload.cycleDate, '2026-06-15');
    });

    it('retains existing cache when data is not ready', async () => {
      const env = { TSTM_CACHE_DIR: dir, TSTM_INGESTION_INTERVAL_MS: '60000' };
      writeCache({ target: 'beta', day: 1, period: 'full', data: SAMPLE_CACHE_DATA, env });

      const runGenerator = async () => ({
        features: [],
        completeness: { complete: false, checkedHours: [1, 24], matchedHours: [], missingHours: [1, 24] },
      });

      await runIngestionCycle({
        env,
        target: 'beta',
        runGenerator,
        now: new Date('2026-06-15T15:00:00Z').getTime(),
      });

      // Cache should still be the original data
      const cached = readCache('beta', 1, 'full', env);
      assert.ok(cached);
      assert.equal(cached.run, '2026-06-13T12:00:00Z');
    });

    it('retains existing cache when generator throws', async () => {
      const env = { TSTM_CACHE_DIR: dir, TSTM_INGESTION_INTERVAL_MS: '60000' };
      writeCache({ target: 'beta', day: 1, period: 'full', data: SAMPLE_CACHE_DATA, env });

      const runGenerator = async () => {
        throw new Error('SPC data unavailable');
      };

      await runIngestionCycle({
        env,
        target: 'beta',
        runGenerator,
        now: new Date('2026-06-15T15:00:00Z').getTime(),
      });

      const cached = readCache('beta', 1, 'full', env);
      assert.ok(cached);
      assert.equal(cached.run, '2026-06-13T12:00:00Z');
    });
  });

  describe('startIngestionLoop', () => {
    let dir;
    beforeEach(() => { dir = tmpDir(); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('throws when runGenerator is missing', () => {
      assert.throws(() => {
        startIngestionLoop({ env: { TSTM_CACHE_DIR: dir } });
      }, /runGenerator is required/);
    });

    it('starts and stops without error', async () => {
      const env = { TSTM_CACHE_DIR: dir, TSTM_INGESTION_INTERVAL_MS: '60000' };
      let callCount = 0;
      const runGenerator = async () => {
        callCount += 1;
        return SAMPLE_CACHE_DATA;
      };

      const stop = startIngestionLoop({ env, runGenerator, intervalMs: 50 });
      assert.equal(typeof stop, 'function');

      // Wait for at least one cycle
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.ok(callCount >= 1);

      stop();
    });
  });
});
