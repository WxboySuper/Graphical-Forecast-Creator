import type { OutlookType } from '../types/outlooks';

/**
 * Outlook data keys whose reducer value is a `Map<string, Feature[]>`.
 *
 * Keep this list next to the serializable check so adding an outlook type does
 * not leave a Map-carrying state branch outside the ignore list.
 */
export const MAP_OUTLOOK_TYPES = [
  'categorical',
  'tornado',
  'wind',
  'hail',
  'totalSevere',
  'day4-8',
] as const satisfies readonly OutlookType[];

const MAP_OUTLOOK_PATTERN = MAP_OUTLOOK_TYPES.join('|');

/**
 * State paths that may hold Map instances.
 *
 * Every path ends at an outlook `data` map rather than a specific day or
 * history index, so the day and stack counts can change without editing this
 * file. Add a new entry here when a reducer stores a Map on a new branch.
 */
export const SERIALIZABLE_IGNORED_PATHS: Array<string | RegExp> = [
  new RegExp(`^forecast\\.forecastCycle\\.days\\.\\d+\\.data\\.(${MAP_OUTLOOK_PATTERN})$`),
  new RegExp(
    `^forecast\\.savedCycles\\.\\d+\\.forecastCycle\\.days\\.\\d+\\.data\\.(${MAP_OUTLOOK_PATTERN})$`,
  ),
  new RegExp(
    `^forecast\\.historyByDay\\.\\d+\\.(undoStack|redoStack)\\.\\d+\\.snapshot\\.data\\.(${MAP_OUTLOOK_PATTERN})$`,
  ),
  new RegExp(
    `^verification\\.loadedForecast\\.days\\.\\d+\\.data\\.(${MAP_OUTLOOK_PATTERN})$`,
  ),
];

/**
 * Action names whose payloads carry Map instances before the reducers unwrap
 * them. Action payloads are checked separately from state, so these cannot be
 * inferred from the paths above.
 */
export const SERIALIZABLE_IGNORED_ACTIONS: string[] = [
  'forecast/addFeature',
  'forecast/removeFeature',
  'forecast/importForecasts',
  'forecast/importForecastCycle',
  'forecast/loadCycleHistory',
  'forecast/loadSavedCycle',
  'forecast/restoreForecastCycle',
  'forecast/setOutlookMap',
  'forecast/applyAutoCategoricalSync',
  'forecast/applyPaintBucketEdit',
  'forecast/resetCategorical',
  'forecast/undoLastEdit',
  'forecast/redoLastEdit',
  'verification/loadVerificationForecast',
];
