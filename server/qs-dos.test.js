'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('qs dependency (Dependabot #125 DoS fix)', () => {
  it('resolves the patched qs version that fixes the stringify DoS', () => {
    const qsPackage = require('qs/package.json');
    const [major, minor, patch] = qsPackage.version.split('.').map(Number);
    assert.ok(
      major > 6 || (major === 6 && minor >= 15),
      `qs must be >=6.15.0 to fix the arrayFormat:"comma" + encodeValuesOnly DoS, found ${qsPackage.version}`,
    );
    // Lock to the exact fixed line we ship (6.15.2) so a future regression is caught.
    assert.ok(
      major > 6 || (major === 6 && (minor > 15 || (minor === 15 && patch >= 2))),
      `qs must be >=6.15.2 (security override), found ${qsPackage.version}`,
    );
  });

  it('stringify skips null/undefined entries with arrayFormat:"comma" + encodeValuesOnly (was DoS in 6.14.x)', () => {
    const qs = require('qs');
    assert.doesNotThrow(() =>
      qs.stringify(
        { tags: ['a', null, undefined, 'b'] },
        { arrayFormat: 'comma', encodeValuesOnly: true },
      ),
    );
  });

  it('stringify still produces the expected comma output for valid entries', () => {
    const qs = require('qs');
    const encoded = qs.stringify(
      { tags: ['a', 'b', 'c'] },
      { arrayFormat: 'comma', encodeValuesOnly: true },
    );
    assert.equal(encoded, 'tags=a,b,c');
  });
});
