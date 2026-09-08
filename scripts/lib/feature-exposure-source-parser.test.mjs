/**
 * Script test contract for feature-exposure-source-parser.test.
 *
 * This file verifies the script or automation boundary represented by feature-exposure-source-parser.test, including its inputs, outputs, and failure behavior.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractConst, parseSource } from './feature-exposure-source-parser.mjs';

describe('feature exposure source parser', () => {
  it('extracts the supported TypeScript literal syntax without executing code', () => {
    const source = `
      const BASE = { enabled: true, count: -2 } as const;
      export const REGISTRY = ({
        ...BASE,
        label: 'beta',
        values: [1, null, false],
        callback: () => 'never executed',
      } satisfies Record<string, unknown>);
    `;

    assert.deepEqual(extractConst(source, 'fixture.ts', 'REGISTRY'), {
      enabled: true,
      count: -2,
      label: 'beta',
      values: [1, null, false],
      callback: undefined,
    });
  });

  it('rejects computed properties', () => {
    assert.throws(
      () => extractConst("const KEY = 'unsafe'; const VALUE = { [KEY]: true };", 'fixture.ts', 'VALUE'),
      /Unsupported computed property/,
    );
  });

  it('rejects executable expressions', () => {
    assert.throws(
      () => extractConst('const VALUE = getRuntimeValue();', 'fixture.ts', 'VALUE'),
      /Unsupported non-literal expression/,
    );
  });

  it('rejects circular constant references', () => {
    assert.throws(
      () => extractConst('const A = B; const B = A;', 'fixture.ts', 'A'),
      /Circular constant reference/,
    );
  });

  it('reports malformed TypeScript with its file name', () => {
    assert.throws(() => parseSource('const VALUE = {', 'broken.ts'), /Could not parse broken\.ts/);
  });
});