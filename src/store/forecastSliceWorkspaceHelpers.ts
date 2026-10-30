import type { OutlookData, OutlookType, DayType, OutlookDay } from '../types/outlooks';
import type { CycleMetadata, StandardGrouping, WorkflowMetadata } from '../types/workflow';
import type { UnknownAction } from '@reduxjs/toolkit';
import { getLocalCalendarDate } from '../utils/localDate';
import { readActionTimestamp } from './timestampMiddleware';
import {
  resolveForecastWorkspaceId,
  type ForecastWorkspaceId,
} from '../config/forecastWorkspaces';
import { getFirstExposedOutlookType } from '../config/productExposureSelectors';
import type { ForecastState, SavedCycle } from './forecastSlice';

type DayBucket = 'day12' | 'day3' | 'day48';

interface CopyFeatureRule {
  sourceType: OutlookType;
  targetType: OutlookType;
}

export const SAVED_CYCLES_LIMIT = 50;
/** Storage key for the workflow-active flag; persisted by the store subscription, not by reducers. */
export const WORKFLOW_ACTIVE_STORAGE_KEY = 'gfc-active-forecast-workflow';
/** Deterministic timestamp used for the module-level initial state so no clock read happens at import time. */
export const INITIAL_TIMESTAMP = '2026-01-01T00:00:00.000Z';
/** Deterministic cycle date for the module-level initial state, overridden on first user action. */
export const INITIAL_CYCLE_DATE = '2026-01-01';
const ALL_OUTLOOK_TYPES: OutlookType[] = [
  'tornado',
  'wind',
  'hail',
  'categorical',
  'totalSevere',
  'day4-8',
];
const DIRECT_DAY12_COPY_TYPES: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical'];

/** Resolves the local calendar date from an action's stamped timestamp instead of the clock. */
export const getActionLocalCalendarDate = (action: UnknownAction): string =>
  getLocalCalendarDate(new Date(readActionTimestamp(action)));

/**
 * Builds a collision-free, deterministic saved-cycle id. The sequence is the
 * highest trailing number already used among saved cycles, plus one, so
 * replaying the same action sequence from the same state produces the same ids
 * while deleting a cycle can never cause a later id to collide.
 */
export const createSavedCycleId = (state: ForecastState, now: string): string => {
  const highest = (state.savedCycles ?? []).reduce((max, cycle) => {
    const match = /-(\d+)$/.exec(cycle?.id ?? '');
    const sequence = match ? Number(match[1]) : 0;
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `cycle-${now}-${highest + 1}`;
};

export const COPY_FEATURE_RULES: Record<DayBucket, Record<DayBucket, CopyFeatureRule[]>> = {
  day12: {
    day12: DIRECT_DAY12_COPY_TYPES.map((type) => ({ sourceType: type, targetType: type })),
    day3: [{ sourceType: 'categorical', targetType: 'categorical' }],
    day48: [],
  },
  day3: {
    day12: [{ sourceType: 'categorical', targetType: 'categorical' }],
    day3: [
      { sourceType: 'totalSevere', targetType: 'totalSevere' },
      { sourceType: 'categorical', targetType: 'categorical' },
    ],
    day48: [],
  },
  day48: {
    day12: [],
    day3: [{ sourceType: 'day4-8', targetType: 'totalSevere' }],
    day48: [{ sourceType: 'day4-8', targetType: 'day4-8' }],
  },
};

/** Collapses the eight forecast days into the three compatibility groups used for copying. */
export const getDayBucket = (day: DayType): DayBucket => {
  if (day === 1 || day === 2) {
    return 'day12';
  }
  if (day === 3) {
    return 'day3';
  }
  return 'day48';
};

/** Resolves the starting forecast day implied by a workflow template's first grouping. */
export const getWorkflowStartDay = (template?: WorkflowMetadata): DayType => {
  const firstGrouping = template?.groupings[0];
  if (firstGrouping === 'day2') return 2;
  if (firstGrouping === 'day3') return 3;
  if (firstGrouping === 'day4-8') return 4;
  return 1;
};

/** Keeps only standard groupings used by completion validation. */
export const getWorkflowValidationGroupings = (
  template?: WorkflowMetadata,
): StandardGrouping[] | undefined => {
  const standardGroupings = (template?.groupings ?? []).filter(
    (grouping): grouping is StandardGrouping =>
      grouping === 'day1' || grouping === 'day2' || grouping === 'day3' || grouping === 'day4-8',
  );
  return standardGroupings.length > 0 ? standardGroupings : undefined;
};

/** Resolves a workflow ID from template or cycle metadata, falling back to default. */
export const resolveWorkflowId = (
  template?: WorkflowMetadata,
  cycleMetadata?: CycleMetadata,
): string => template?.id || cycleMetadata?.workflowId || 'default';

/** Creates initial workflow cycle metadata. */
export const createInitialCycleMetadata = (
  workflowId: string,
  cycleDate: string,
  now: string,
): CycleMetadata => ({
  id: `WF-${workflowId}-${cycleDate}`,
  workflowId,
  cycleDate,
  status: 'in-progress',
  outlookVersions: [{ version: 1, status: 'in-progress', createdAt: now }],
  createdAt: now,
  updatedAt: now,
});

/** Clears every supported outlook map on a target day before incoming copy operations. */
export const clearOutlookMaps = (data: OutlookData) => {
  ALL_OUTLOOK_TYPES.forEach((type) => {
    data[type]?.clear();
  });
};

/** Creates an empty forecast day with the outlook maps supported for that day number. */
export const createEmptyOutlook = (day: DayType, now: string): OutlookDay => {
  const baseData: OutlookData = {};

  if (day === 1 || day === 2) {
    // Day 1/2: tornado, wind, hail, categorical
    baseData.tornado = new Map();
    baseData.wind = new Map();
    baseData.hail = new Map();
    baseData.categorical = new Map();
  } else if (day === 3) {
    // Day 3: totalSevere, categorical
    baseData.totalSevere = new Map();
    baseData.categorical = new Map();
  } else {
    // Day 4-8: only day4-8 outlook type
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
      lowProbabilityOutlooks: []
    }
  };
};

/** Returns a read-only Map proxy that throws if a consumer tries to mutate it. */
const freezeMap = <K, V>(map: Map<K, V>): Map<K, V> => {
  const proxy: Map<K, V> = new Proxy(map, {
    set: () => {
      throw new Error('Attempted to mutate a shared read-only outlook map.');
    },
    deleteProperty: () => {
      throw new Error('Attempted to mutate a shared read-only outlook map.');
    },
    get: (target, property) => {
      if (property === 'set' || property === 'delete' || property === 'clear') {
        return () => {
          throw new Error('Attempted to mutate a shared read-only outlook map.');
        };
      }
      const value = Reflect.get(target, property, target);
      if (property === 'forEach') {
        return (callback: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown) =>
          target.forEach((entryValue, key) => callback.call(thisArg, entryValue, key, proxy));
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return proxy;
};

/** Deeply guards a value so shared fallbacks cannot be mutated. */
const deepFreezeOutlookData = (data: OutlookData): OutlookData => {
  const guarded: OutlookData = {};
  for (const [type, map] of Object.entries(data)) {
    guarded[type as OutlookType] = map instanceof Map ? freezeMap(map) : map;
  }
  return Object.freeze(guarded);
};

/**
 * Shared, immutable fallback outlook data keyed by day category. Returning the
 * same reference for a given day shape keeps selectors referentially stable so
 * unrelated renders do not trigger avoidable state changes or selector-stability
 * warnings. Consumers must treat these as read-only; the nested Maps are wrapped
 * in a proxy that throws on set/delete/clear so accidental writes fail loudly
 * instead of silently corrupting the shared singleton.
 */
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

/** Bumps the cycle generation when the active forecast document is fully replaced. */
export const advanceCycleGeneration = (state: ForecastState) => {
  state.cycleGeneration = (state.cycleGeneration ?? 0) + 1;
};

/** Normalizes hydrated cycle ownership so direct or legacy payloads cannot bypass Severe fallback. */
export const normalizeCycleWorkspace = (cycle: SavedCycle | null | undefined): SavedCycle | null => {
  if (!cycle || typeof cycle !== 'object') return null;
  return {
    ...cycle,
    workspaceId: resolveForecastWorkspaceId(cycle.workspaceId),
  };
};

/**
 * Returns the tool and custom-editor defaults one workspace starts from.
 * The outlook type comes from build-target exposure and the custom editor only
 * opens in custom mode for the workspace that owns custom layers, so a switch
 * never seeds Severe's defaults into another product.
 */
export const createWorkspaceEditorDefaults = (
  workspaceId: ForecastWorkspaceId,
): Pick<ForecastState, 'drawingState' | 'customEditor'> => ({
  drawingState: {
    activeOutlookType: getFirstExposedOutlookType() ?? 'tornado',
    activeProbability: '2%',
    isSignificant: false,
  },
  customEditor: {
    mode: workspaceId === 'custom' ? 'custom' : 'severe',
    activeLayerId: null,
    activeCategoryId: null,
  },
});
