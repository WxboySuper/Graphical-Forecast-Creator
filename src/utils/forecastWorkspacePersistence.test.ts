import {
  classifyForecastWorkspacePayload,
  createForecastWorkspaceSave,
  FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
  getForecastDataFromWorkspacePayload,
} from './forecastWorkspacePersistence';
import type { GFCForecastSaveData } from '../types/outlooks';

const validForecast = (): GFCForecastSaveData => ({
  version: '1.0.0',
  type: 'forecast-cycle',
  timestamp: '2026-09-08T00:00:00.000Z',
  forecastCycle: { days: {}, currentDay: 1, cycleDate: '2026-09-08' },
  mapView: { center: [0, 0], zoom: 0 },
});

describe('forecast workspace persistence contract', () => {
  test('creates an explicit workspace envelope for new saves', () => {
    const forecast = validForecast();
    expect(createForecastWorkspaceSave('custom', forecast)).toEqual({
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 'custom',
      forecast,
    });
  });

  test('uses the explicit workspace identity before legacy inference', () => {
    const payload = createForecastWorkspaceSave('custom', validForecast());
    expect(classifyForecastWorkspacePayload(payload)).toEqual({
      ok: true,
      workspaceId: 'custom',
      payload,
      legacy: false,
    });
  });

  test('rejects known workspace envelopes with invalid forecast data', () => {
    expect(classifyForecastWorkspacePayload({
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 'custom',
      forecast: {},
    })).toEqual({ ok: false, reason: 'invalid' });
  });

  test('rejects unknown workspace identities instead of guessing', () => {
    expect(classifyForecastWorkspacePayload({
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 'mesoscale-v2',
      forecast: validForecast(),
    })).toEqual({ ok: false, reason: 'unknown-workspace' });
  });

  test('classifies a valid legacy forecast as Severe', () => {
    const payload = validForecast();
    expect(classifyForecastWorkspacePayload(payload)).toEqual({
      ok: true,
      workspaceId: 'severe',
      payload,
      legacy: true,
    });
  });

  test('keeps a legacy Severe payload with custom layers classified as Severe', () => {
    const payload = validForecast();
    payload.forecastCycle!.days = {
      1: {
        day: 1,
        data: {},
        metadata: { issueDate: '2026-09-08', validDate: '2026-09-08', issuanceTime: '0600' },
        customLayers: { schemaVersion: '1.0.0', layers: [] },
      },
    };
    expect(classifyForecastWorkspacePayload(payload)).toMatchObject({ ok: true, workspaceId: 'severe', legacy: true });
  });

  test('checks a product-owned Custom validator only after Severe rejects the payload', () => {
    const payload = { customForecast: true };
    const customPayload = payload as unknown as GFCForecastSaveData;
    expect(classifyForecastWorkspacePayload(payload, {
      isCustomPayload: (value): value is GFCForecastSaveData => value === payload,
    })).toEqual({ ok: true, workspaceId: 'custom', payload: customPayload, legacy: true });
  });

  test('extracts forecast data from both payload generations', () => {
    const forecast = validForecast();
    expect(getForecastDataFromWorkspacePayload(forecast)).toBe(forecast);
    expect(getForecastDataFromWorkspacePayload(createForecastWorkspaceSave('severe', forecast))).toBe(forecast);
  });
});
