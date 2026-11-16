import { fetchMesoscaleLatest } from '../mesoscale/client';
import { BUILD_TARGETS } from '../config/buildTarget';
import { getMesoscaleClientConfig } from '../config/mesoscale';
import { runWithBuildTarget } from '../testing/featureExposure/harness';

describe('mesoscaleWorkspace exposure', () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { __MESOSCALE_FIXTURES__?: boolean }).__MESOSCALE_FIXTURES__;
  });

  it.each(BUILD_TARGETS)('only enables local fixtures on the local target (%s)', async (target) => {
    const fetcher = jest.fn();
    const globalWithFixtures = globalThis as typeof globalThis & { __MESOSCALE_FIXTURES__?: boolean };
    globalWithFixtures.__MESOSCALE_FIXTURES__ = true;
    await runWithBuildTarget(target, async () => {
      const config = getMesoscaleClientConfig();
      expect(config.enabled).toBe(target === 'local');
      if (target === 'local') {
        expect(config).toMatchObject({ fixtures: true, baseUrl: '/mesoscale-fixtures' });
        const result = await fetchMesoscaleLatest({ model: 'hrrr', options: { fetcher, config } });
        expect(result.state).toBe('stale');
      } else {
        const result = await fetchMesoscaleLatest({ model: 'hrrr', options: { fetcher, config } });
        expect(result).toMatchObject({ state: 'upstream-failure', retryable: false });
      }
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
});
