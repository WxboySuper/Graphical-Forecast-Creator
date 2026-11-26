import type { ForecastWorkspaceId } from '../../config/forecastWorkspaces';
import type { ForecastImportResult } from './types';
import { getForecastImportWorkspaceError, isGisTransfer } from './importPolicy';

const workspaces: ForecastWorkspaceId[] = ['severe', 'mesoscale', 'custom', 'tropical', 'winter'];

describe('isGisTransfer', () => {
  it.each([
    ['kml', true],
    ['kmz', true],
    ['json', false],
    ['package', false],
  ] as const)('classifies %s as GIS transfer: %s', (format, expected) => {
    expect(isGisTransfer(format)).toBe(expected);
  });
});

describe('getForecastImportWorkspaceError', () => {
  it.each(workspaces)('allows owned JSON imports in the %s workspace', workspaceId => {
    expect(getForecastImportWorkspaceError({ workspaceId, format: 'json' }, workspaceId)).toBeNull();
  });

  it.each(workspaces.flatMap(owner => workspaces
    .filter(active => active !== owner)
    .map(active => [owner, active] as const)))('rejects a %s forecast in the %s workspace', (owner, active) => {
    expect(getForecastImportWorkspaceError({ workspaceId: owner, format: 'json' }, active)).toBe(
      `This forecast belongs to the ${owner} workspace. Open it there before importing it.`,
    );
  });

  it.each([
    ['kml', 'severe', null],
    ['kmz', 'severe', null],
    ['kml', 'custom', 'This file does not declare a forecast workspace. KML/KMZ geometry cannot be imported across the workspace boundary.'],
    ['kmz', 'winter', 'This file does not declare a forecast workspace. KML/KMZ geometry cannot be imported across the workspace boundary.'],
    ['json', 'severe', 'This file does not declare a forecast workspace and cannot be imported.'],
    ['package', 'mesoscale', 'This file does not declare a forecast workspace and cannot be imported.'],
  ] as const)('handles unowned %s files in %s', (format, active, expected) => {
    const result = { workspaceId: null, format } as Pick<ForecastImportResult, 'workspaceId' | 'format'>;
    expect(getForecastImportWorkspaceError(result, active)).toBe(expected);
  });

  it.each(['__proto__', 'constructor', 'severe\u0000'] as const)(
    'rejects hostile runtime workspace values (%s)', workspaceId => {
      const result = { workspaceId, format: 'json' } as unknown as Pick<ForecastImportResult, 'workspaceId' | 'format'>;
      expect(getForecastImportWorkspaceError(result, 'severe')).not.toBeNull();
    },
  );
});
