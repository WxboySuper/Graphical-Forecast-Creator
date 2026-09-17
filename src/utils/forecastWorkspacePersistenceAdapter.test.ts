import { serializeForecastWorkspace, deserializeForecastWorkspace } from './forecastWorkspacePersistenceAdapter';
import type { ForecastCycle } from '../types/outlooks';
import { createForecastWorkspaceSave } from './forecastWorkspacePersistence';

const cycle = (): ForecastCycle => ({
  days: {},
  currentDay: 1,
  cycleDate: '2026-09-08',
});

describe('forecast workspace persistence adapter', () => {
  test('serializes a cycle with explicit workspace identity', () => {
    const result = serializeForecastWorkspace('severe', cycle(), { center: [-98, 39], zoom: 4 });

    expect(result.workspaceId).toBe('severe');
    expect(result.forecast.forecastCycle?.cycleDate).toBe('2026-09-08');
  });

  test('restores the workspace identity and forecast data from an envelope', () => {
    const payload = serializeForecastWorkspace('custom', cycle(), { center: [-98, 39], zoom: 4 });

    expect(deserializeForecastWorkspace(payload)).toEqual({
      workspaceId: 'custom',
      forecastCycle: cycle(),
      mapView: { center: [-98, 39], zoom: 4 },
      legacy: false,
    });
  });

  test('opens a legacy payload in Severe and marks it as migrated', () => {
    const payload = serializeForecastWorkspace('severe', cycle(), { center: [0, 0], zoom: 0 }).forecast;

    expect(deserializeForecastWorkspace(payload)).toMatchObject({ workspaceId: 'severe', legacy: true });
  });

  test('rejects unsupported payloads with an actionable error', () => {
    expect(() => deserializeForecastWorkspace({})).toThrow('not supported by any workspace');
  });

  test('does not silently open a malformed explicit envelope', () => {
    const payload = createForecastWorkspaceSave('custom', {
      version: '1.0.0',
      type: 'forecast-cycle',
      timestamp: '2026-09-08T00:00:00.000Z',
      forecastCycle: { days: {}, currentDay: 1, cycleDate: '2026-09-08' },
    });
    expect(() => deserializeForecastWorkspace({ ...payload, forecast: {} })).toThrow('incomplete or invalid');
  });
});
