import { countForecastMetrics } from './forecastMetrics';

describe('forecastMetrics', () => {
  test('countForecastMetrics counts days/outlooks/features', () => {
    const forecast = {
      days: {
        1: {
          day: 1,
          metadata: { lowProbabilityOutlooks: [], issueDate:'', validDate:'', issuanceTime:'', createdAt:'', lastModified:'' },
          data: {
            categorical: new Map([['TSTM', [{ type: 'Feature', geometry: null, properties: {} }]]])
          }
        }
      },
      currentDay: 1,
      cycleDate: '2026-04-21'
    } as any;
    const metrics = countForecastMetrics(forecast);
    expect(metrics.forecastDays).toBe(1);
    expect(metrics.totalOutlooks).toBe(1);
    expect(metrics.totalFeatures).toBe(1);
  });
});
