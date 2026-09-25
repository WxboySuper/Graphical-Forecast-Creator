import type { GFCForecastSaveData } from '../types/outlooks';
import {
  FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
  createForecastWorkspaceSave,
  getForecastDataFromWorkspacePayload,
  hasWorkspaceEnvelopeWrapper,
  isWorkspaceSaveEnvelope,
} from './forecastWorkspaceEnvelope';

const validForecast = (): GFCForecastSaveData => ({
  version: '1.0.0',
  type: 'forecast-cycle',
  timestamp: '2026-09-24T00:00:00.000Z',
  forecastCycle: { days: {}, currentDay: 1, cycleDate: '2026-09-24' },
  mapView: { center: [0, 0], zoom: 0 },
});

describe('forecast workspace envelope checks', () => {
  test('recognizes the wrapper shape without claiming an owner', () => {
    expect(hasWorkspaceEnvelopeWrapper({
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 'bogus',
      forecast: validForecast(),
    })).toBe(true);
    expect(hasWorkspaceEnvelopeWrapper(validForecast())).toBe(false);
    expect(hasWorkspaceEnvelopeWrapper(null)).toBe(false);
    expect(hasWorkspaceEnvelopeWrapper([])).toBe(false);
  });

  test('accepts an envelope only when the version, shape, and owner all resolve', () => {
    expect(isWorkspaceSaveEnvelope(createForecastWorkspaceSave('custom', validForecast()))).toBe(true);
    expect(isWorkspaceSaveEnvelope(createForecastWorkspaceSave('severe', validForecast()))).toBe(true);
  });

  test('refuses to treat an envelope with an unknown owner as a valid envelope', () => {
    expect(isWorkspaceSaveEnvelope({
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 'bogus',
      forecast: validForecast(),
    })).toBe(false);
    expect(isWorkspaceSaveEnvelope({
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 42,
      forecast: validForecast(),
    })).toBe(false);
  });

  test('refuses an envelope with the wrong version or a non-object forecast', () => {
    expect(isWorkspaceSaveEnvelope({
      schemaVersion: 99,
      workspaceId: 'severe',
      forecast: validForecast(),
    })).toBe(false);
    expect(isWorkspaceSaveEnvelope({
      schemaVersion: FORECAST_WORKSPACE_SAVE_SCHEMA_VERSION,
      workspaceId: 'severe',
      forecast: 'not-an-object',
    })).toBe(false);
  });

  test('writes a registered owner into every new envelope', () => {
    const envelope = createForecastWorkspaceSave('custom', validForecast());
    expect(envelope.workspaceId).toBe('custom');
    expect(isWorkspaceSaveEnvelope(envelope)).toBe(true);
    expect(getForecastDataFromWorkspacePayload(envelope)).toBe(envelope.forecast);
  });
});
