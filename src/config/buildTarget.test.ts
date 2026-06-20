import { getBuildTarget } from './buildTarget';

describe('getBuildTarget', () => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;

  afterEach(() => {
    globalThis.__GFC_BUILD_TARGET__ = originalTarget;
  });

  test.each(['local', 'beta', 'staging', 'production'] as const)(
    'returns the embedded %s target',
    (target) => {
      globalThis.__GFC_BUILD_TARGET__ = target;
      expect(getBuildTarget()).toBe(target);
    }
  );
});
