import { fetchMesoscaleLatest } from '../mesoscale/client';
import { BUILD_TARGETS } from '../config/buildTarget';
import { getMesoscaleClientConfig } from '../config/mesoscale';
import { runWithBuildTarget } from '../testing/featureExposure/harness';

describe('mesoscaleWorkspace disabled exposure', () => {
  it.each(BUILD_TARGETS)('does not fetch when mesoscaleWorkspace is disabled on %s', async (target) => {
    const fetcher = jest.fn();
    await runWithBuildTarget(target, async () => {
      expect(getMesoscaleClientConfig().enabled).toBe(false);
      const result = await fetchMesoscaleLatest('hrrr', { fetcher });
      expect(result).toMatchObject({ state: 'upstream-failure', retryable: false });
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
});
