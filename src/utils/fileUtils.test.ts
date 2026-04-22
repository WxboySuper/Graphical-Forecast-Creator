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
});
