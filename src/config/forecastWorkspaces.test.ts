import { BUILD_TARGETS, type BuildTarget } from './buildTarget';
import {
  DEFAULT_FORECAST_WORKSPACE,
  FORECAST_WORKSPACES,
  getDefaultForecastWorkspace,
  getExposedForecastWorkspaces,
  getForecastWorkspace,
  getForecastWorkspaceByLegacyPath,
  getForecastWorkspaceByPath,
  isForecastWorkspaceExposed,
} from './forecastWorkspaces';

describe('forecast workspace product contract', () => {
  test('defines canonical workspace paths in product order', () => {
    expect(FORECAST_WORKSPACES.map((workspace) => workspace.path)).toEqual([
      '/forecast/severe',
      '/forecast/mesoscale',
      '/forecast/tropical',
      '/forecast/winter',
      '/forecast/custom',
    ]);
  });

  test.each(BUILD_TARGETS)('exposes Severe and Custom according to the %s target', (target: BuildTarget) => {
    expect(getExposedForecastWorkspaces(target).map((workspace) => workspace.id)).toEqual(['severe', 'custom']);
    expect(isForecastWorkspaceExposed(getForecastWorkspace('custom')!, target)).toBe(true);
    expect(getForecastWorkspace('tropical')?.exposureKey).toBeNull();
    for (const workspaceId of ['mesoscale', 'tropical', 'winter'] as const) {
      expect(isForecastWorkspaceExposed(getForecastWorkspace(workspaceId)!, target)).toBe(false);
    }
  });

  test('keeps unknown IDs and malformed paths out of the contract', () => {
    expect(getForecastWorkspace('unknown')).toBeUndefined();
    expect([
      '/forecast/unknown',
      '/forecast/severe/',
      '/Forecast/severe',
      '',
    ].map(getForecastWorkspaceByPath)).toEqual([undefined, undefined, undefined, undefined]);
    expect(['unknown', '/custom-products/', '/Custom-products', ''].map(getForecastWorkspaceByLegacyPath))
      .toEqual([undefined, undefined, undefined, undefined]);
  });

  test('resolves canonical workspace records', () => {
    expect(getForecastWorkspace('mesoscale')).toMatchObject({
      path: '/forecast/mesoscale',
      productType: 'mesoscale',
      status: 'future',
      exposureKey: null,
    });
    expect(getForecastWorkspace('winter')).toMatchObject({
      status: 'future',
      exposureKey: null,
    });
    expect(getForecastWorkspaceByPath('/forecast/custom')).toMatchObject({
      id: 'custom',
      productType: 'custom',
    });
  });

  test('does not expose a gated workspace without an explicit feature key', () => {
    const customWorkspace = getForecastWorkspace('custom')!;

    expect(customWorkspace.status).toBe('gated');
    expect(isForecastWorkspaceExposed({ ...customWorkspace, exposureKey: null }, 'production')).toBe(false);
  });

  test('keeps product identity separate from workspace exposure', () => {
    expect(getForecastWorkspace('severe')?.productType).toBe('severe');
    expect(getForecastWorkspace('custom')?.productType).toBe('custom');
    expect(isForecastWorkspaceExposed(getForecastWorkspace('severe')!, 'production')).toBe(true);
    expect(isForecastWorkspaceExposed(getForecastWorkspace('mesoscale')!, 'production')).toBe(false);
    expect(isForecastWorkspaceExposed(getForecastWorkspace('winter')!, 'production')).toBe(false);
  });

  test('uses Severe for legacy Forecast entry points', () => {
    expect(DEFAULT_FORECAST_WORKSPACE).toBe('severe');
    expect(getDefaultForecastWorkspace().path).toBe('/forecast/severe');
    expect(getDefaultForecastWorkspace().legacyPaths).toContain('/forecast');
    expect(getForecastWorkspaceByLegacyPath('/forecast')?.id).toBe('severe');
    expect(getForecastWorkspaceByLegacyPath('/custom-products')?.id).toBe('custom');
  });
});
