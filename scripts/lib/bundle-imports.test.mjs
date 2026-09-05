import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEagerModuleImports } from './bundle-imports.mjs';

test('finds static imports and re-exports, including side-effect imports', () => {
  const source = `
    import './turf-side-effect.js';
    import { polygon } from './turf-vendor.js';
    export { area } from '@turf/area';
    export * from './turf-export.js';
    export const value = 1;
  `;
  assert.deepEqual(getEagerModuleImports(source), [
    './turf-side-effect.js', './turf-vendor.js', '@turf/area', './turf-export.js',
  ]);
});

test('ignores lazy imports, strings, and preload tables', () => {
  const source = `
    const dependencies = ['assets/turf-vendor.js'];
    const load = () => import('./turf-vendor.js');
    const description = "import './turf-comment.js'";
    // import './turf-comment.js';
  `;
  assert.deepEqual(getEagerModuleImports(source), []);
});
