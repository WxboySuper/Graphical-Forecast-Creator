import { fetchRadarSiteOptions, resetRadarSiteCacheForTests } from './radarSites';

describe('radarSites', () => {
  beforeEach(() => {
    resetRadarSiteCacheForTests();
    jest.restoreAllMocks();
  });

  test('parses and sorts NOAA radar site options', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { properties: { rda_id: 'KTLX', name: 'Oklahoma City' } },
          { properties: { rda_id: 'KAMA', name: 'Amarillo' } },
        ],
      }),
    } as Response);

    await expect(fetchRadarSiteOptions()).resolves.toEqual([
      { id: 'KAMA', name: 'Amarillo', label: 'KAMA — Amarillo', wfoId: undefined },
      { id: 'KTLX', name: 'Oklahoma City', label: 'KTLX — Oklahoma City', wfoId: undefined },
    ]);
  });
});
