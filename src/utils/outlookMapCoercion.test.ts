import {
  coerceOutlookProbabilityMap,
  normalizeForecastCycle,
  normalizeOutlookData,
} from './outlookMapCoercion';
import type { Feature as GeoJsonFeature } from 'geojson';
import type { ForecastCycle, OutlookData } from '../types/outlooks';

describe('outlookMapCoercion', () => {
  test('GFC-WEB-7: plain empty objects coerce to Maps so forEach is safe', () => {
    const legacyEmpty = {};
    expect(typeof (legacyEmpty as { forEach?: unknown }).forEach).not.toBe('function');

    const probMap = coerceOutlookProbabilityMap(legacyEmpty);
    expect(probMap).toBeInstanceOf(Map);
    expect(() => probMap?.forEach(() => undefined)).not.toThrow();
  });

  test('coerceOutlookProbabilityMap accepts plain objects from legacy persistence', () => {
    const plain = {
      '30%': [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }],
    };
    const map = coerceOutlookProbabilityMap(plain);
    expect(map?.get('30%')).toHaveLength(1);
  });

  test('coerceOutlookProbabilityMap accepts serialized map entry arrays', () => {
    const serialized: [string, { type: 'Feature'; properties: object; geometry: { type: 'Polygon'; coordinates: [] } }][] = [
      ['30%', [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }]],
    ];
    const map = coerceOutlookProbabilityMap(serialized);
    expect(map?.get('30%')).toHaveLength(1);
  });

  test('normalizeOutlookData coerces legacy plain-object maps', () => {
    const data = {
      tornado: {},
      wind: { '10%': [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }] },
      hail: new Map(),
    } as unknown as OutlookData;

    const normalized = normalizeOutlookData(data);
    expect(normalized.tornado).toBeUndefined();
    expect(normalized.wind?.get('10%')).toHaveLength(1);
    expect(normalized.hail).toBeInstanceOf(Map);
    expect(normalized.hail?.size).toBe(0);
  });

  test('normalizeOutlookData preserves empty Map instances', () => {
    const emptyMap = new Map<string, GeoJsonFeature[]>();
    const normalized = normalizeOutlookData({
      tornado: emptyMap,
      wind: [],
    } as unknown as OutlookData);

    expect(normalized.tornado).toBe(emptyMap);
    expect(normalized.wind).toBeInstanceOf(Map);
    expect(normalized.wind?.size).toBe(0);
  });

  test('normalizeForecastCycle normalizes every day', () => {
    const cycle: ForecastCycle = {
      currentDay: 1,
      cycleDate: '2026-03-01',
      days: {
        1: {
          day: 1,
          metadata: {
            issueDate: 'x',
            validDate: 'x',
            issuanceTime: '0600',
            lowProbabilityOutlooks: [],
          },
          data: {
            tornado: {},
            categorical: {},
          } as unknown as OutlookData,
        },
      },
    };

    const normalized = normalizeForecastCycle(cycle);
    expect(normalized.days[1]?.data.tornado).toBeUndefined();
    expect(normalized.days[1]?.data.categorical).toBeUndefined();
  });
});
