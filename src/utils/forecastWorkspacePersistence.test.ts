import {
  buildCloudSessionPayload,
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

  test('does not double-wrap an already-enveloped cloud handoff payload', () => {
    const envelope = createForecastWorkspaceSave('severe', validForecast());
    expect(buildCloudSessionPayload('severe', envelope)).toBe(envelope);
    const customEnvelope = createForecastWorkspaceSave('custom', validForecast());
    expect(() => buildCloudSessionPayload('severe', customEnvelope)).toThrow(/different forecast workspace/);
  });

  test('rejects an invalid cloud payload instead of wrapping it as forecast data', () => {
    expect(() => buildCloudSessionPayload('severe', { legacy: true })).toThrow(/not supported by any workspace/);
    expect(() => buildCloudSessionPayload('severe', { nope: true })).toThrow(/not supported by any workspace/);
    expect(() => buildCloudSessionPayload('severe', {
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 'severe',
      forecast: {},
    })).toThrow(/incomplete or invalid/);
    expect(() => buildCloudSessionPayload('severe', {
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 'bogus',
      forecast: validForecast(),
    })).toThrow(/unknown workspace/);
  });

  test('accepts a valid custom payload and envelopes it for the custom workspace', () => {
    // A legacy save carries no identity, so the workspace that opened it owns it.
    expect(buildCloudSessionPayload('custom', validForecast())).toEqual(
      createForecastWorkspaceSave('custom', validForecast()),
    );

    // A payload only the caller's Custom validator recognizes is Custom, never Severe.
    const customPayload = { customForecast: true };
    const validators = {
      isCustomPayload: (value: unknown): value is GFCForecastSaveData => value === customPayload,
    };
    expect(buildCloudSessionPayload('custom', customPayload, validators)).toEqual({
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 'custom',
      forecast: customPayload,
    });
    expect(() => buildCloudSessionPayload('severe', customPayload, validators)).toThrow(/different forecast workspace/);
  });
});
