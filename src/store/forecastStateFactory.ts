/**
 * Builds deterministic initial and normalized forecast state values.
 * This module owns state-shape construction helpers for the forecast store; it does not manage Redux dispatch or persistence.
 */
import type {
  DayType,
  OutlookData,
  OutlookDay,
  OutlookType,
} from '../types/outlooks';

/** Deterministic timestamp used for module-level forecast state initialization. */
export const INITIAL_TIMESTAMP = '2026-01-01T00:00:00.000Z';

/** Deterministic cycle date used for module-level forecast state initialization. */
export const INITIAL_CYCLE_DATE = '2026-01-01';

const ALL_OUTLOOK_TYPES: OutlookType[] = [
  'tornado',
  'wind',
  'hail',
  'categorical',
  'totalSevere',
  'day4-8',
];

/** Clears every supported outlook map on a target day before incoming copy operations. */
export const clearOutlookMaps = (data: OutlookData): void => {
  ALL_OUTLOOK_TYPES.forEach((type) => {
    data[type]?.clear();
  });
};

/** Creates an empty forecast day with the outlook maps supported for that day number. */
export const createEmptyOutlook = (day: DayType, now: string): OutlookDay => {
  const baseData: OutlookData = {};

  if (day === 1 || day === 2) {
    baseData.tornado = new Map();
    baseData.wind = new Map();
    baseData.hail = new Map();
    baseData.categorical = new Map();
  } else if (day === 3) {
    baseData.totalSevere = new Map();
    baseData.categorical = new Map();
  } else {
    baseData['day4-8'] = new Map();
  }

  return {
    day,
    data: baseData,
    metadata: {
      issueDate: now,
      validDate: now,
      issuanceTime: '0600',
      createdAt: now,
      lastModified: now,
      lowProbabilityOutlooks: [],
    },
  };
};

/** Returns a read-only Map proxy that throws if a consumer tries to mutate it. */
const freezeMap = <K, V>(map: Map<K, V>): Map<K, V> =>
  new Proxy(map, {
    set: () => {
      throw new Error('Attempted to mutate a shared read-only outlook map.');
    },
    deleteProperty: () => {
      throw new Error('Attempted to mutate a shared read-only outlook map.');
    },
    get: (target, property, receiver) => {
      if (property === 'set' || property === 'delete' || property === 'clear') {
        return () => {
          throw new Error('Attempted to mutate a shared read-only outlook map.');
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });

/** Deeply guards a value so shared fallbacks cannot be mutated. */
const deepFreezeOutlookData = (data: OutlookData): OutlookData => {
  const guarded: OutlookData = {};
  for (const [type, map] of Object.entries(data)) {
    guarded[type as OutlookType] = map instanceof Map ? freezeMap(map) : map;
  }
  return Object.freeze(guarded);
};

const EMPTY_OUTLOOK_DATA_BY_DAY: Record<string, OutlookData> = {
  day12: deepFreezeOutlookData(createEmptyOutlook(1, INITIAL_TIMESTAMP).data),
  day3: deepFreezeOutlookData(createEmptyOutlook(3, INITIAL_TIMESTAMP).data),
  day48: deepFreezeOutlookData(createEmptyOutlook(4, INITIAL_TIMESTAMP).data),
};

/** Returns the shared empty outlook data for a day, or null when the day is unknown. */
export const sharedEmptyOutlookData = (day: DayType): OutlookData | null => {
  if (day === 1 || day === 2) return EMPTY_OUTLOOK_DATA_BY_DAY.day12;
  if (day === 3) return EMPTY_OUTLOOK_DATA_BY_DAY.day3;
  if (day >= 4 && day <= 8) return EMPTY_OUTLOOK_DATA_BY_DAY.day48;
  return null;
};

/** Returns the day 4-8 empty shape used when a selector receives an invalid day. */
export const getFallbackOutlookData = (): OutlookData => EMPTY_OUTLOOK_DATA_BY_DAY.day48;
