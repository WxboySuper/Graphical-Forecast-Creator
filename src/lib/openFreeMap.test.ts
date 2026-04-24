import { getOpenFreeMapStyleSet, isOpenFreeMapStyle } from './openFreeMap';

const stylePayload = {
  version: 8,
  sources: { openmaptiles: { type: 'vector' } },
  layers: [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill' },
    { id: 'road_major', type: 'line' },
    { id: 'bridge_minor', type: 'line' },
    { id: 'road_area_pattern', type: 'fill' },
    { id: 'place_label', type: 'symbol' },
  ],
};

describe('openFreeMap helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(stylePayload),
    });
  });

  test('recognizes OpenFreeMap-backed base map styles', () => {
    expect(isOpenFreeMapStyle('osm')).toBe(true);
    expect(isOpenFreeMapStyle('carto-light')).toBe(true);
    expect(isOpenFreeMapStyle('satellite')).toBe(false);
  });

  test('splits fetched style into base and overlay layer stacks and caches the result', async () => {
    const first = await getOpenFreeMapStyleSet('osm');
    const second = await getOpenFreeMapStyleSet('osm');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.baseStyle.layers.map((layer) => layer.id)).toEqual(['background', 'water']);
    expect(first.overlayStyle.layers.map((layer) => layer.id)).toEqual([
      'road_major',
      'bridge_minor',
      'road_area_pattern',
      'place_label',
    ]);
  });

  test('rejects non OpenFreeMap styles and clears failed fetches from cache', async () => {
    await expect(getOpenFreeMapStyleSet('satellite')).rejects.toThrow(/does not use OpenFreeMap/);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(stylePayload),
      });

    await expect(getOpenFreeMapStyleSet('carto-light')).rejects.toThrow(/Unable to load/);
    await expect(getOpenFreeMapStyleSet('carto-light')).resolves.toEqual(
      expect.objectContaining({ baseStyle: expect.any(Object), overlayStyle: expect.any(Object) })
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
