import { BUILD_TARGETS, type BuildTarget } from './buildTarget';
import {
  DEFAULT_FORECAST_WORKSPACE,
  FORECAST_WORKSPACES,
  getDefaultForecastWorkspace,
  getExposedForecastWorkspaces,
  getForecastWorkspace,
  getForecastWorkspaceByPath,
  isForecastWorkspaceExposed,
} from './forecastWorkspaces';

describe('forecast workspace product contract', () => {
  test('defines canonical workspace paths in product order', () => {
    expect(FORECAST_WORKSPACES.map((workspace) => workspace.path)).toEqual([
      '/forecast/severe',
      '/forecast/mesoscale',
      '/forecast/custom',
      '/forecast/tropical',
      '/forecast/winter',
    ]);
  });

  test.each(BUILD_TARGETS)('exposes Severe and Custom according to the %s target', (target: BuildTarget) => {
    expect(getExposedForecastWorkspaces(target).map((workspace) => workspace.id)).toEqual(['severe', 'custom']);
  });

  test('keeps unknown IDs and paths out of the contract', () => {
    expect(getForecastWorkspace('unknown')).toBeUndefined();
    expect(getForecastWorkspaceByPath('/forecast/unknown')).toBeUndefined();
  });

  test('resolves canonical workspace records', () => {
    expect(getForecastWorkspace('mesoscale')).toMatchObject({
      path: '/forecast/mesoscale',
      productType: 'mesoscale',
      exposureKey: 'mesoscaleWorkspace',
    });
    expect(getForecastWorkspaceByPath('/forecast/custom')).toMatchObject({
      id: 'custom',
      productType: 'custom',
    });
  });

  test('keeps product identity separate from workspace exposure', () => {
    expect(getForecastWorkspace('severe')?.productType).toBe('severe');
    expect(getForecastWorkspace('custom')?.productType).toBe('custom');
    expect(isForecastWorkspaceExposed(getForecastWorkspace('severe')!, 'production')).toBe(true);
    expect(isForecastWorkspaceExposed(getForecastWorkspace('mesoscale')!, 'production')).toBe(false);
  });

  test('uses Severe for legacy Forecast entry points', () => {
    expect(DEFAULT_FORECAST_WORKSPACE).toBe('severe');
    expect(getDefaultForecastWorkspace().path).toBe('/forecast/severe');
    expect(getDefaultForecastWorkspace().legacyPaths).toContain('/forecast');
  });
});
