import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { incrementBetaPrerelease, incrementPatchVersion } from './version-bump.mjs';

describe('version bump', () => {
  it('increments beta prerelease counter', () => {
    assert.equal(incrementBetaPrerelease('1.6.0-beta.1'), '1.6.0-beta.2');
  });

  it('starts beta line from stable', () => {
    assert.equal(incrementBetaPrerelease('1.6.0'), '1.6.0-beta.1');
  });

  it('increments patch on main', () => {
    assert.equal(incrementPatchVersion('1.6.0'), '1.6.1');
  });
});
