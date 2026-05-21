import {
  buildRadarLayerConfig,
  buildSatelliteLayerConfig,
  findLatestLayerTime,
  findLayerTimeValues,
  getRadarProductsForMode,
  parseWmsLayerTimes,
  resolveRadarProductForMode,
  selectAnimationFrameTimes,
} from './wms';

const sampleCapabilities = `
<WMS_Capabilities>
  <Capability>
    <Layer>
      <Layer>
        <Name>conus_bref_qcd</Name>
        <Dimension name="time" default="2026-04-28T17:46:20Z">2026-04-28T17:40:20Z,2026-04-28T17:46:20Z</Dimension>
      </Layer>
      <Layer>
        <Name>goes_visible_imagery</Name>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

describe('WMS helpers', () => {
  test('builds radar and satellite layer configs', () => {
    expect(buildRadarLayerConfig({ radarMode: 'none', radarProduct: 'bref-qcd', radarSite: 'KTLX' })).toBeNull();
    expect(buildRadarLayerConfig({ radarMode: 'mrms-conus', radarProduct: 'cref-qcd', radarSite: 'KTLX' })).toEqual(
      expect.objectContaining({ layer: 'conus_cref_qcd' })
    );
    expect(buildRadarLayerConfig({ radarMode: 'site', radarProduct: 'sr-bvel', radarSite: 'KTLX' })).toEqual(
      expect.objectContaining({ layer: 'ktlx_sr_bvel' })
    );
    expect(buildRadarLayerConfig({ radarMode: 'site', radarProduct: 'sr-bref', radarSite: 'KT' })).toBeNull();
    expect(buildSatelliteLayerConfig('none')).toBeNull();
    expect(buildSatelliteLayerConfig('goes-visible')).toEqual(expect.objectContaining({ layer: 'goes_visible_imagery' }));
  });

  test('parses latest WMS layer times and tolerates missing dimensions', () => {
    expect(parseWmsLayerTimes(sampleCapabilities)).toEqual(expect.arrayContaining([
      {
        layerName: 'conus_bref_qcd',
        latestTime: '2026-04-28T17:46:20Z',
        timeValues: ['2026-04-28T17:40:20Z', '2026-04-28T17:46:20Z'],
      },
      { layerName: 'goes_visible_imagery', latestTime: undefined, timeValues: [] },
    ]));
    expect(findLatestLayerTime(sampleCapabilities, 'conus_bref_qcd')).toBe('2026-04-28T17:46:20Z');
    expect(findLayerTimeValues(sampleCapabilities, 'conus_bref_qcd')).toEqual([
      '2026-04-28T17:40:20Z',
      '2026-04-28T17:46:20Z',
    ]);
    expect(findLatestLayerTime(sampleCapabilities, 'missing')).toBeUndefined();
  });

  test('filters radar products by source mode', () => {
    expect(getRadarProductsForMode('mrms-conus').map((product) => product.value)).toEqual(['bref-qcd', 'cref-qcd']);
    expect(getRadarProductsForMode('site').map((product) => product.value)).toEqual(['sr-bref', 'sr-bvel']);
    expect(resolveRadarProductForMode('site', 'cref-qcd')).toBe('sr-bref');
    expect(resolveRadarProductForMode('mrms-conus', 'sr-bvel')).toBe('bref-qcd');
  });

  test('selects trailing frames for playback', () => {
    const frames = Array.from({ length: 20 }, (_, index) => `2026-04-28T17:${String(index).padStart(2, '0')}:00Z`);
    expect(selectAnimationFrameTimes(frames, 12)).toHaveLength(12);
    expect(selectAnimationFrameTimes(frames, 12)[0]).toBe('2026-04-28T17:08:00Z');
    expect(selectAnimationFrameTimes(['only-frame'], 12)).toEqual(['only-frame']);
  });
});
