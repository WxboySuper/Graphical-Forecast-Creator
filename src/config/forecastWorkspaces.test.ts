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
  requireForecastWorkspaceId,
  resolveStoredWorkspaceId,
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

  test('keeps the Custom Products library separate from legacy Forecast entry points', () => {
    expect(DEFAULT_FORECAST_WORKSPACE).toBe('severe');
    expect(getDefaultForecastWorkspace().path).toBe('/forecast/severe');
    expect(getDefaultForecastWorkspace().legacyPaths).toContain('/forecast');
    expect(getForecastWorkspaceByLegacyPath('/forecast')?.id).toBe('severe');
    expect(getForecastWorkspaceByLegacyPath('/custom-products')).toBeUndefined();
  });

  test('returns a registered workspace from requireForecastWorkspaceId', () => {
    expect(requireForecastWorkspaceId('severe')).toBe('severe');
    expect(requireForecastWorkspaceId('custom')).toBe('custom');
  });

  test('fails closed when a writer cannot name a registered workspace', () => {
    for (const invalid of [undefined, null, '', 'Severe', 'mesoscale-v2', 42, {}]) {
      expect(() => requireForecastWorkspaceId(invalid)).toThrow('valid workspace');
    }
  });

  test('resolves stored workspace ids without relabeling an unknown owner', () => {
    // Absent means a record written before workspaces existed: stay on the default.
    expect(resolveStoredWorkspaceId(undefined)).toBe('severe');
    expect(resolveStoredWorkspaceId(null)).toBe('severe');
    // Registered ids are returned as-is.
    expect(resolveStoredWorkspaceId('custom')).toBe('custom');
    expect(resolveStoredWorkspaceId('mesoscale')).toBe('mesoscale');
    // Anything else has no usable owner and must stay distinguishable.
    expect(resolveStoredWorkspaceId('bogus')).toBeNull();
    expect(resolveStoredWorkspaceId('Severe')).toBeNull();
    expect(resolveStoredWorkspaceId(42)).toBeNull();
    expect(resolveStoredWorkspaceId({})).toBeNull();
  });
});
