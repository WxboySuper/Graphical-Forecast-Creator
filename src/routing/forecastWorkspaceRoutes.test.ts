import {
  DEFAULT_FORECAST_WORKSPACE,
  getDefaultForecastWorkspacePath,
  getExposedForecastWorkspacePaths,
  getExposedForecastWorkspaceRoutes,
  getForecastWorkspacePath,
  resolveExposedForecastWorkspacePath,
  resolveExposedLegacyForecastWorkspacePath,
  resolveForecastWorkspacePath,
  resolveLegacyForecastWorkspacePath,
  resolveRouteForecastWorkspace,
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
    expect(resolveLegacyForecastWorkspacePath('/custom-products')).toBeUndefined();
    expect(resolveLegacyForecastWorkspacePath('/discussion')).toBeUndefined();
  });

  test('returns only exposed canonical routes for each build target', () => {
    expect(getExposedForecastWorkspacePaths('production')).toEqual([
      '/forecast/severe',
      '/forecast/custom',
    ]);
  });

  test('scopes route identity to forecast routes and gates legacy fallback by exposure', () => {
    // Non-forecast pages never own workspace identity.
    expect(resolveRouteForecastWorkspace('/')).toBeUndefined();
    expect(resolveRouteForecastWorkspace('/cloud')).toBeUndefined();
    expect(resolveRouteForecastWorkspace('/discussion')).toBeUndefined();
    expect(resolveRouteForecastWorkspace('/custom-products')).toBeUndefined();
    expect(resolveRouteForecastWorkspace('/verification')).toBeUndefined();
    expect(resolveRouteForecastWorkspace('/monitor')).toBeUndefined();
    expect(resolveRouteForecastWorkspace('/forecast/unknown')).toBeUndefined();
    // Canonical routes tolerate bookmarked trailing slashes.
    expect(resolveRouteForecastWorkspace('/forecast/severe/')?.id).toBe('severe');
    // Legacy entry points resolve only when the owning workspace is exposed.
    expect(resolveRouteForecastWorkspace('/forecast')?.id).toBe('severe');
    expect(resolveExposedForecastWorkspacePath('/forecast/mesoscale', 'production')).toBeUndefined();
    expect(resolveExposedLegacyForecastWorkspacePath('/forecast', 'production')?.id).toBe('severe');
  });

  test('registers exposed workspaces from validated route records', () => {
    const routes = getExposedForecastWorkspaceRoutes('production');
    expect(routes.map((route) => route.id)).toEqual(['severe', 'custom']);
    for (const route of routes) {
      expect(route.path).toBe(`/forecast/${route.routePath}`);
    }
    // Unexposed workspaces never produce a route record.
    expect(routes.some((route) => route.id === 'mesoscale')).toBe(false);
  });
});
