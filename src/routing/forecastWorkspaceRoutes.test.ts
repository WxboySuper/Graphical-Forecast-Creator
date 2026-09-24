import {
  DEFAULT_FORECAST_WORKSPACE,
  getDefaultForecastWorkspacePath,
  getExposedForecastWorkspacePaths,
  getExposedForecastWorkspaceRoutes,
  getForecastWorkspacePath,
  getUnavailableForecastWorkspaceRoutes,
  isSupportedCloudLoadWorkspace,
  resolveExposedForecastWorkspacePath,
  resolveExposedLegacyForecastWorkspacePath,
  resolveForecastWorkspacePath,
  resolveLegacyForecastWorkspacePath,
  resolveRouteForecastWorkspace,
  resolveUnavailableForecastWorkspacePath,
} from './forecastWorkspaceRoutes';
import { getForecastWorkspace } from '../config/forecastWorkspaces';

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

  test('supports cloud loads only for workspaces with a registered exposed editor route', () => {
    expect(isSupportedCloudLoadWorkspace('severe', getForecastWorkspace('severe'))).toBe(true);
    expect(isSupportedCloudLoadWorkspace('custom', getForecastWorkspace('custom'))).toBe(true);
    expect(isSupportedCloudLoadWorkspace('mesoscale', getForecastWorkspace('mesoscale'))).toBe(false);
    expect(isSupportedCloudLoadWorkspace('tropical', getForecastWorkspace('tropical'))).toBe(false);
    expect(isSupportedCloudLoadWorkspace('winter', getForecastWorkspace('winter'))).toBe(false);
    expect(isSupportedCloudLoadWorkspace('severe', undefined)).toBe(false);
    expect(isSupportedCloudLoadWorkspace('severe', getForecastWorkspace('custom'))).toBe(false);
  });

  test('routes direct gated URLs to the unavailable page and keeps unknown paths unregistered', () => {
    expect(resolveUnavailableForecastWorkspacePath('/forecast/tropical', 'production')?.id).toBe('tropical');
    expect(resolveUnavailableForecastWorkspacePath('/forecast/mesoscale', 'production')?.id).toBe('mesoscale');
    expect(resolveUnavailableForecastWorkspacePath('/forecast/winter', 'production')?.id).toBe('winter');
    // Exposed editors never count as unavailable.
    expect(resolveUnavailableForecastWorkspacePath('/forecast/severe', 'production')).toBeUndefined();
    expect(resolveUnavailableForecastWorkspacePath('/forecast/custom', 'production')).toBeUndefined();
    // Unknown paths stay on the existing not-found behavior.
    expect(resolveUnavailableForecastWorkspacePath('/forecast/unknown', 'production')).toBeUndefined();
    expect(resolveRouteForecastWorkspace('/forecast/unknown', 'production')).toBeUndefined();

    const unavailable = getUnavailableForecastWorkspaceRoutes('production');
    expect(unavailable.map((route) => route.id)).toEqual(['mesoscale', 'tropical', 'winter']);
    for (const route of unavailable) {
      expect(route.path).toBe(`/forecast/${route.routePath}`);
    }
    expect(unavailable.some((route) => route.id === 'severe')).toBe(false);
  });
});
