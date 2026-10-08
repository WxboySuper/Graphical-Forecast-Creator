import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNextBetaVersion } from './calculate-next-beta-version.mjs';

test('calculateNextBetaVersion increments from the latest beta tag', () => {
  const result = calculateNextBetaVersion({
    packageVersion: '1.8.0-beta.5',
    betaTags: ['v1.8.0-beta.1', 'v1.8.0-beta.5'],
  });
  assert.equal(result.version, '1.8.0-beta.6');
  assert.equal(result.strategy, 'increment');
});

test('calculateNextBetaVersion retries an untagged package version', () => {
  const result = calculateNextBetaVersion({
    packageVersion: '1.8.0-beta.5',
    betaTags: ['v1.8.0-beta.4'],
    taggedVersions: new Set(['v1.8.0-beta.4']),
  });
  assert.equal(result.version, '1.8.0-beta.5');
  assert.equal(result.strategy, 'retry-unpublished');
});

test('calculateNextBetaVersion honors an explicit version newer than the latest tag', () => {
  const result = calculateNextBetaVersion({
    packageVersion: '1.8.0-beta.2',
    betaTags: ['v1.8.0-beta.5'],
    explicitVersion: '1.8.0-beta.9',
  });
  assert.equal(result.version, '1.8.0-beta.9');
  assert.equal(result.strategy, 'explicit');
});

test('calculateNextBetaVersion rejects an explicit version that is already tagged', () => {
  assert.throws(
    () => calculateNextBetaVersion({
      packageVersion: '1.8.0-beta.5',
      betaTags: ['v1.8.0-beta.5'],
      explicitVersion: '1.8.0-beta.5',
      taggedVersions: new Set(['v1.8.0-beta.5']),
    }),
    /already tagged/,
  );
});

test('calculateNextBetaVersion rejects an explicit version that is not newer than the latest tag', () => {
  assert.throws(
    () => calculateNextBetaVersion({
      packageVersion: '1.8.0-beta.5',
      betaTags: ['v1.8.0-beta.8'],
      explicitVersion: '1.8.0-beta.7',
    }),
    /newer than the latest tag/,
  );
});

test('calculateNextBetaVersion rejects an explicit version lower than package.json', () => {
  assert.throws(
    () => calculateNextBetaVersion({
      packageVersion: '1.8.0-beta.5',
      betaTags: ['v1.8.0-beta.3'],
      explicitVersion: '1.8.0-beta.4',
    }),
    /must not be lower than package\.json/,
  );
});
