import {
  DEFAULT_FORECAST_WORKSPACE,
  getDefaultForecastWorkspacePath,
  getExposedForecastWorkspacePaths,
  getForecastWorkspacePath,
  resolveForecastWorkspacePath,
  resolveLegacyForecastWorkspacePath,
} from './forecastWorkspaceRoutes';

describe('forecast workspace route contract', () => {
  test('uses the canonical Severe route for the legacy Forecast entry point', () => {
    expect(DEFAULT_FORECAST_WORKSPACE).toBe('severe');
    expect(getDefaultForecastWorkspacePath()).toBe('/forecast/severe');
  });

  test('resolves canonical workspace paths without exposing them', () => {
    expect(getForecastWorkspacePath('mesoscale')).toBe('/forecast/mesoscale');
    expect(resolveForecastWorkspacePath('/forecast/mesoscale')?.id).toBe('mesoscale');
    expect(resolveForecastWorkspacePath('/forecast/unknown')).toBeUndefined();
  });

  test('maps legacy paths to their owning workspace', () => {
    expect(resolveLegacyForecastWorkspacePath('/forecast')?.id).toBe('severe');
    expect(resolveLegacyForecastWorkspacePath('/custom-products')?.id).toBe('custom');
    expect(resolveLegacyForecastWorkspacePath('/discussion')).toBeUndefined();
  });

  test('returns only exposed canonical routes for each build target', () => {
    expect(getExposedForecastWorkspacePaths('production')).toEqual([
      '/forecast/severe',
      '/forecast/custom',
    ]);
  });
});
