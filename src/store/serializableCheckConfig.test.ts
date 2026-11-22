import {
  MAP_OUTLOOK_TYPES,
  SERIALIZABLE_IGNORED_ACTIONS,
  SERIALIZABLE_IGNORED_PATHS,
} from './serializableCheckConfig';

const matchesAnyPath = (path: string) =>
  SERIALIZABLE_IGNORED_PATHS.some((pattern) =>
    typeof pattern === 'string' ? pattern === path : pattern.test(path),
  );

describe('serializableCheckConfig', () => {
  it('lists each Map-carrying outlook type once', () => {
    expect(new Set(MAP_OUTLOOK_TYPES).size).toBe(MAP_OUTLOOK_TYPES.length);
    expect(MAP_OUTLOOK_TYPES.length).toBeGreaterThan(0);
  });

  it('matches Map data on the active day, saved cycles, and history stacks', () => {
    for (const outlookType of MAP_OUTLOOK_TYPES) {
      expect(matchesAnyPath(`forecast.forecastCycle.days.0.data.${outlookType}`)).toBe(true);
      expect(
        matchesAnyPath(
          `forecast.savedCycles.2.forecastCycle.days.0.data.${outlookType}`,
        ),
      ).toBe(true);
      expect(
        matchesAnyPath(`forecast.historyByDay.1.undoStack.3.snapshot.data.${outlookType}`),
      ).toBe(true);
      expect(matchesAnyPath(`verification.loadedForecast.days.0.data.${outlookType}`)).toBe(
        true,
      );
    }
  });

  it('leaves non-Map paths checked', () => {
    expect(matchesAnyPath('forecast.forecastCycle.days.0.data.unknownOutlook')).toBe(false);
    expect(matchesAnyPath('forecast.forecastCycle.days.0.metadata')).toBe(false);
    expect(matchesAnyPath('forecast.currentMapView')).toBe(false);
    expect(matchesAnyPath('monitor.radarFrames')).toBe(false);
  });

  it('keeps Map-payload actions in the ignore list', () => {
    for (const action of [
      'forecast/setOutlookMap',
      'forecast/applyAutoCategoricalSync',
      'forecast/applyPaintBucketEdit',
    ]) {
      expect(SERIALIZABLE_IGNORED_ACTIONS).toContain(action);
    }
  });
});
