import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNextBetaVersion } from './calculate-next-beta-version.mjs';

for (const { name, packageVersion, betaTags, targetBase, expectedVersion } of [
  {
    name: 'increments from the latest beta tag',
    packageVersion: '1.8.0-beta.5',
    betaTags: ['v1.8.0-beta.1', 'v1.8.0-beta.5'],
    expectedVersion: '1.8.0-beta.6',
  },
  {
    name: 'continues the beta counter while moving from v1.8 to flat v2',
    packageVersion: '1.8.0-beta.15',
    betaTags: ['v1.8.0-beta.14', 'v1.8.0-beta.15'],
    targetBase: '2.0.0',
    expectedVersion: '2.0.0-beta.16',
  },
]) {
  test(`calculateNextBetaVersion ${name}`, () => {
    const result = calculateNextBetaVersion({ packageVersion, betaTags, targetBase });
    assert.equal(result.version, expectedVersion);
    assert.equal(result.strategy, 'increment');
  });
}

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
