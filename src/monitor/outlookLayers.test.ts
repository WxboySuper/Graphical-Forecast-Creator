import type { OutlookData } from '../types/outlooks';
import {
  coerceOutlookProbabilityMap,
  flattenMonitorOutlookFeatures,
  isRenderableMonitorProbability,
  MONITOR_OUTLOOK_LAYER_TYPES,
} from './outlookLayers';

describe('monitor outlook layers', () => {
  test('exposes four Day 1 outlook layer types', () => {
    expect(MONITOR_OUTLOOK_LAYER_TYPES).toEqual(['tornado', 'wind', 'hail', 'categorical']);
  });

  test('isRenderableMonitorProbability rejects unknown CIG levels', () => {
    expect(isRenderableMonitorProbability('10%')).toBe(true);
    expect(isRenderableMonitorProbability('CIG2')).toBe(true);
    expect(isRenderableMonitorProbability('CIG0')).toBe(false);
    expect(isRenderableMonitorProbability('CIG9')).toBe(false);
  });

  test('coerceOutlookProbabilityMap accepts plain objects from legacy persistence', () => {
    const plain = {
      MRGL: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }],
    };
    const map = coerceOutlookProbabilityMap(plain);
    expect(map?.get('MRGL')).toHaveLength(1);
  });

  test('flattenMonitorOutlookFeatures returns only the selected outlook type', () => {
    const data: OutlookData = {
      categorical: new Map([['MRGL', [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }]]]),
      tornado: new Map([['10%', [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }]]]),
      wind: new Map([['CIG0', [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }]]]),
    };

    const categorical = flattenMonitorOutlookFeatures(data, 'categorical');
    expect(categorical).toHaveLength(1);
    expect(categorical[0]?.probability).toBe('MRGL');

    const tornado = flattenMonitorOutlookFeatures(data, 'tornado');
    expect(tornado).toHaveLength(1);
    expect(tornado[0]?.outlookType).toBe('tornado');

    const wind = flattenMonitorOutlookFeatures(data, 'wind');
    expect(wind).toHaveLength(0);

    const plainData = {
      categorical: {
        SLGT: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }],
      },
    } as unknown as OutlookData;

    expect(flattenMonitorOutlookFeatures(plainData, 'categorical')).toHaveLength(1);
  });
});
