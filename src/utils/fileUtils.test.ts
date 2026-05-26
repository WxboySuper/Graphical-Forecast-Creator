import { serializeForecast, deserializeForecast, validateForecastData } from './fileUtils';

describe('fileUtils', () => {
  type ForecastCycle = {
    days: Record<number, {
      day: number;
      metadata: Record<string, unknown>;
      data: { categorical: Map<string, unknown[]> };
    }>;
    currentDay: number;
    cycleDate: string;
  };

  test('validateForecastData returns false for invalid input', () => {
    expect(validateForecastData(null)).toBe(false);
    expect(validateForecastData({})).toBe(false);
  });

  test('serialize/deserialize round-trip preserves map types', () => {
    const cycle: ForecastCycle = {
      days: {
        1: {
          day: 1,
          metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', createdAt:'', lastModified:'', lowProbabilityOutlooks:[] },
          data: { categorical: new Map([['TSTM', []]]) }
        }
      },
      currentDay: 1,
      cycleDate: '2026-04-21'
    };
    const ser = serializeForecast(cycle, { center: [0,0], zoom:0 });
    expect(ser.forecastCycle).toBeDefined();
    expect(validateForecastData(ser)).toBe(true);
    const des = deserializeForecast(ser);
    expect(des.days[1].data.categorical instanceof Map).toBe(true);
  });

  test('serializeForecast handles non-Map data without throwing', () => {
    const corruptedCycle = {
      days: {
        1: {
          day: 1,
          metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', createdAt:'', lastModified:'', lowProbabilityOutlooks:[] },
          data: { categorical: {} }
        }
      },
      currentDay: 1,
      cycleDate: '2026-04-21'
    } as unknown as ForecastCycle;

    let ser: ReturnType<typeof serializeForecast>;
    expect(() => { ser = serializeForecast(corruptedCycle, { center: [0,0], zoom: 0 }); }).not.toThrow();
    expect(ser!.forecastCycle?.days?.[1]?.data?.categorical).toEqual([]);
  });

  test('deserializeForecast handles non-Array data without throwing', () => {
    const corruptedData = {
      version: '0.5.0',
      type: 'forecast-cycle',
      timestamp: '2026-05-26',
      forecastCycle: {
        days: {
          1: {
            day: 1,
            metadata: { issueDate: 'x', validDate: 'y', issuanceTime: '0600', lowProbabilityOutlooks:[] },
            data: { tornado: 'not-an-array' }
          }
        },
        currentDay: 1,
        cycleDate: '2026-05-26'
      },
      mapView: { center: [0,0], zoom: 4 }
    };

    expect(() => deserializeForecast(corruptedData as never)).not.toThrow();
    const result = deserializeForecast(corruptedData as never);
    expect(result.days[1]?.data.tornado instanceof Map).toBe(true);
  });
});
