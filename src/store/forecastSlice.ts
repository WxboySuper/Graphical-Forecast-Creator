import '../immerSetup';
import { isDraft, original } from 'immer';
import { createSlice, PayloadAction, type UnknownAction } from '@reduxjs/toolkit';
import { OutlookData, OutlookType, DrawingState, ForecastCycle, DayType, OutlookDay, DiscussionData, DiscussionGrouping } from '../types/outlooks';
import type { CycleMetadata, WorkflowMetadata, Package, CycleValidationResult } from '../types/workflow';
import { normalizeForecastCycle } from '../utils/outlookMapCoercion';
import type { Feature } from 'geojson';
import type { RootState } from './index';
import type { CustomLayerCollection } from '../types/customProducts';
import { cloneForecastCycle } from '../utils/fileUtils';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { createCustomLayerReducers } from './customLayerReducers';
import { createCustomCategoryReducers } from './customCategoryReducers';
import { createCustomFeatureReducers } from './customFeatureReducers';
import { createForecastOutlookReducers } from './forecastOutlookReducers';
import { readActionTimestamp } from './timestampMiddleware';
import { areTstmFeaturesEqual } from '../utils/tstmGeneration';
import { validateCycleCompletion } from '../utils/completionValidation';
import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';

import { isValidDiscussionGroupings, mergeDiscussionDrafts, normalizeDiscussionGroupings } from '../utils/discussionGrouping';
import { cloneJsonValue } from './cloneJsonValue';
import type { TrimOutlookDataResult } from '../utils/outlookPolygonMasking/trimOutlookData';
import {
  advanceCycleGeneration,
  INITIAL_CYCLE_DATE,
  INITIAL_TIMESTAMP,
  SAVED_CYCLES_LIMIT,
  createSavedCycleId,
  COPY_FEATURE_RULES,
  getActionLocalCalendarDate,
  clearOutlookMaps,
  createEmptyOutlook,
  createInitialCycleMetadata,
  createWorkspaceEditorDefaults,
  getDayBucket,
  getWorkflowStartDay,
  getWorkflowValidationGroupings,
  normalizeCycleWorkspace,
  resolveWorkflowId,
  sharedEmptyOutlookData,
} from './forecastSliceWorkspaceHelpers';
import {
  applyPaintBucketStrategy,
  type PaintBucketEditAction,
} from '../utils/paintBucket';
import {
  copyOutlookGeometry,
  countCopyableSourceFeatures,
  type CopyOutlookGeometryOptions,
} from '../utils/outlookGeometryCopy';
import {
  DEFAULT_FORECAST_WORKSPACE,
  getForecastWorkspace,
  resolveForecastWorkspaceId,
  type ForecastWorkspaceId,
} from '../config/forecastWorkspaces';
import { getSavedCycleWorkspaceId } from './forecastSliceSelectors';

const HISTORY_LIMIT = 50;

export interface SavedCycleStats {
  forecastDays: number;
  totalOutlooks: number;
  totalFeatures: number;
}

export interface SavedCycle {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastCycle: ForecastCycle;
  stats: SavedCycleStats;
  /** Product workspace that owns this local saved cycle. Legacy records default to Severe. */
  workspaceId?: ForecastWorkspaceId;
  /** v2 workflow metadata for the cycle (optional, present for workflow-imported cycles). */
  workflowMetadata?: CycleMetadata;
}

export interface CycleHistoryLoad {
  cycles: SavedCycle[];
  lifetimeCycleStats: LifetimeCycleStats;
}

export interface LifetimeCycleStats {
  totalCyclesMade: number;
  totalForecastsMade: number;
  forecastStreak?: number;
  lastSavedCycleDate?: string;
}

export interface ForecastState {
  /** Product workspace currently owning the active forecast state. */
  workspaceId: ForecastWorkspaceId;
  forecastCycle: ForecastCycle;
  /** Bumps on every whole-cycle replacement so async work can detect the active document changed. */
  cycleGeneration: number;
  drawingState: DrawingState;
  customEditor: {
    mode: 'severe' | 'custom';
    activeLayerId: string | null;
    activeCategoryId: string | null;
  };
  currentMapView: {
    center: [number, number]; // [latitude, longitude]
    zoom: number;
  };
  isSaved: boolean;
  emergencyMode: boolean;
  savedCycles: SavedCycle[];
  lifetimeCycleStats?: LifetimeCycleStats;
  historyByDay: Partial<Record<DayType, ForecastHistoryStacks>>;
  /** Unsaved discussion editor drafts, keyed by grouping id so shared owner days cannot collide. */
  discussionDraftsByScope: Record<string, DiscussionData>;
  /** Drafts parked for the workspaces that are not mounted, keyed by workspace id. */
  discussionDraftsByWorkspace: Partial<Record<ForecastWorkspaceId, Record<string, DiscussionData>>>;
  /** v2 workflow metadata for the active cycle (optional, present when loaded from a workflow package). */
  workflowMetadata?: CycleMetadata;
  /** v2 workflow template metadata (optional, present when the editor is in workflow mode). */
  workflowTemplate?: WorkflowMetadata;
  /** Whether the forecast workflow shell should be active across routes. */
  isWorkflowActive: boolean;
  completionValidation: {
    lastResult: CycleValidationResult | null;
    showCompletionModal: boolean;
    omittedDays: Partial<Record<DayType, string>>;
  };
  /** v2 outlook version snapshots for the active cycle (used for same-cycle updates). */
  outlookVersionSnapshots: OutlookVersionSnapshot[];
  /** Editor-visible auto-categorical derivation error, or null when derivation is healthy. */
  autoCategoricalError: string | null;
  lastTrimResult: TrimOutlookDataResult | null;
}

interface ForecastDaySnapshot {
  day: DayType;
  data: OutlookData;
  lowProbabilityOutlooks: OutlookType[];
  outlookOpacities?: Partial<Record<OutlookType, number>>;
  customLayers?: CustomLayerCollection;
}

interface ForecastHistoryEntry {
  day: DayType;
  snapshot: ForecastDaySnapshot;
}

interface ForecastHistoryStacks {
  undoStack: ForecastHistoryEntry[];
  redoStack: ForecastHistoryEntry[];
}

/** Stores a snapshot of outlook data for a specific version within a cycle. */
interface OutlookVersionSnapshot {
  /** Version number within the cycle. */
  version: number;
  /** Snapshot of day data for this version. */
  days: Partial<Record<DayType, OutlookDay>>;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}


const initialState: ForecastState = {
  cycleGeneration: 1,
  workspaceId: DEFAULT_FORECAST_WORKSPACE,
  forecastCycle: {
    days: {
      1: createEmptyOutlook(1, INITIAL_TIMESTAMP)
    },
    currentDay: 1,
    cycleDate: INITIAL_CYCLE_DATE
  },
  ...createWorkspaceEditorDefaults(DEFAULT_FORECAST_WORKSPACE),
  currentMapView: {
    center: [39.8283, -98.5795],
    zoom: 4
  },
  isSaved: true,
  emergencyMode: false,
  savedCycles: [],
  lifetimeCycleStats: { totalCyclesMade: 0, totalForecastsMade: 0 },
  historyByDay: {},
  discussionDraftsByScope: {},
  discussionDraftsByWorkspace: {},
  completionValidation: {
    lastResult: null,
    showCompletionModal: false,
    omittedDays: {},
  },
  isWorkflowActive: false,
  outlookVersionSnapshots: [],
  autoCategoricalError: null,
  lastTrimResult: null,
};

// Helpers to keep reducers small and testable
const computeOutlookType = (feature: Feature, state: ForecastState): OutlookType => {
  return (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;
};

/** Normalizes a feature's probability into the store format for its outlook type. */
const computeProbability = (feature: Feature, state: ForecastState): string => {
  const fallback = state.drawingState.activeProbability;
  const base = (feature.properties?.probability ?? fallback) as string;
  const outlookType = (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;

  // If the outlook type is categorical, return categorical labels unchanged
  if (outlookType === 'categorical') {
    return base;
  }

  // If hatching or CIG level, return CIG label unchanged
  if (String(base).startsWith('CIG')) {
    return base;
  }

  const normalized = String(base).replace(/[%#]/g, '');
  return `${normalized}%`;
};

/** Ensures new features carry the active outlook metadata required by the editor. */
const buildFeatureWithProps = (
  feature: Feature,
  outlookType: OutlookType,
  probability: string,
  isSignificant: boolean
): Feature => {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      outlookType,
      probability,
      isSignificant,
      derivedFrom: feature.properties?.derivedFrom || outlookType,
      originalProbability: feature.properties?.originalProbability || probability
    }
  } as Feature;
};

// Helper to get current outlook data safely
const getCurrentOutlook = (state: ForecastState, dayNumber = state.forecastCycle.currentDay): OutlookData => {
  const day = state.forecastCycle.days[dayNumber];
  if (!day) {
    // Should not happen if logic is correct, but safe fallback
    return createEmptyOutlook(dayNumber, INITIAL_TIMESTAMP).data;
  }
  return day.data;
};

interface PendingFeatureUpdate {
  outlookType: OutlookType;
  probability: string;
  index: number;
  feature: Feature;
}

/** Finds incoming features that already exist in the selected day's outlook maps. */
const collectPendingFeatureUpdates = (
  state: ForecastState,
  incoming: Feature[],
  day?: DayType,
): PendingFeatureUpdate[] => {
  const outlookData = getCurrentOutlook(state, day);

  return incoming.flatMap((feature) => {
    const outlookType = (feature.properties?.outlookType as OutlookType)
      || state.drawingState.activeOutlookType;
    const probability = (feature.properties?.probability as string)
      || state.drawingState.activeProbability;
    const features = outlookData[outlookType]?.get(probability);
    if (!features) return [];

    const index = features.findIndex((entry) => entry.id === feature.id);
    return index === -1 ? [] : [{ outlookType, probability, index, feature }];
  });
};

// @codescene(disable:"Bumpy Road Ahead")
const applyPendingFeatureUpdates = (
  state: ForecastState,
  pendingUpdates: PendingFeatureUpdate[],
  day?: DayType,
): void => {
  const outlookData = getCurrentOutlook(state, day);

  for (const update of pendingUpdates) {
    const features = outlookData[update.outlookType]?.get(update.probability);
    if (!features) {
      continue;
    }

    if (update.feature.geometry === null) {
      features.splice(update.index, 1);
      if (features.length === 0) {
        outlookData[update.outlookType]?.delete(update.probability);
      }
      continue;
    }

    features[update.index] = {
      ...features[update.index],
      geometry: update.feature.geometry,
      properties: {
        ...features[update.index].properties,
        ...update.feature.properties,
      },
    };
  }
};

/** Clones one GeoJSON feature without JSON serialization so history snapshots are cheaper. */
const cloneFeature = (feature: Feature): Feature => cloneJsonValue(feature);
const featureCloneCache = new WeakMap<object, Feature>();

/**
 * Immer creates a fresh draft wrapper for each reducer invocation. Use the
 * stable base object as the cache key while snapshots are captured before the
 * enclosing reducer mutates that feature. Plain snapshots keep their own
 * identity, so restore operations remain isolated from one another.
 */
const getFeatureCacheKey = (feature: Feature): object => {
  if (!isDraft(feature)) return feature;
  return original(feature) ?? feature;
};

/** Clones a feature once per stable source identity while building history snapshots. */
const cloneFeatureCached = (feature: Feature): Feature => {
  const cacheKey = getFeatureCacheKey(feature);
  const cached = featureCloneCache.get(cacheKey);
  if (cached) return cached;
  const cloned = cloneFeature(feature);
  featureCloneCache.set(cacheKey, cloned);
  return cloned;
};

/** Returns the history stacks for one day, creating empty stacks when needed. */
const getOrCreateDayHistory = (
  state: ForecastState,
  day: DayType = state.forecastCycle.currentDay
): ForecastHistoryStacks => {
  if (!state.historyByDay[day]) {
    state.historyByDay[day] = {
      undoStack: [],
      redoStack: []
    };
  }

  return state.historyByDay[day] as ForecastHistoryStacks;
};

/** Deep-clones one probability map so undo/redo snapshots do not share mutable arrays. */
const cloneEntries = (map?: Map<string, Feature[]>): Map<string, Feature[]> | undefined => {
  if (!map) return undefined;
  return new Map(Array.from(map.entries(), ([probability, features]) => [
    probability,
    features.map(cloneFeatureCached),
  ]));
};

/** Copies only the outlook types allowed by the source/target day compatibility rules. */
const copyCompatibleOutlooks = (
  sourceData: OutlookData,
  targetData: OutlookData,
  sourceDay: DayType,
  targetDay: DayType
) => {
  const copyRules = COPY_FEATURE_RULES[getDayBucket(sourceDay)][getDayBucket(targetDay)];

  copyRules.forEach(({ sourceType, targetType }) => {
    const clonedMap = cloneEntries(sourceData[sourceType]);
    if (clonedMap) {
      targetData[targetType] = clonedMap;
    }
  });
};

/** Deep-clones all outlook maps for a day so history snapshots remain isolated from live edits. */
const cloneOutlookData = (data: OutlookData): OutlookData => {
  return {
    tornado: cloneEntries(data.tornado),
    wind: cloneEntries(data.wind),
    hail: cloneEntries(data.hail),
    totalSevere: cloneEntries(data.totalSevere),
    categorical: cloneEntries(data.categorical),
    'day4-8': cloneEntries(data['day4-8']),
  };
};

/** Deep-clones custom layer metadata for an isolated history snapshot. */
const cloneCustomLayers = (customLayers?: CustomLayerCollection): CustomLayerCollection | undefined =>
  customLayers ? cloneJsonValue(customLayers) : undefined;

/** Lifecycle transitions preserve stored custom content even while its editor is hidden. */
const cloneIntegratedCustomLayers = (customLayers?: CustomLayerCollection): CustomLayerCollection | undefined =>
  cloneCustomLayers(customLayers);

/** Captures the current day's drawable outlook data and low-probability metadata for history. */
const getCurrentDaySnapshot = (
  state: ForecastState,
  day: DayType = state.forecastCycle.currentDay,
): ForecastDaySnapshot | null => {
  const currentDay = day;
  const dayData = state.forecastCycle.days[currentDay];
  if (!dayData) return null;

  return {
    day,
    data: cloneOutlookData(dayData.data),
    lowProbabilityOutlooks: [...(dayData.metadata.lowProbabilityOutlooks || [])],
    outlookOpacities: dayData.metadata.outlookOpacities ? { ...dayData.metadata.outlookOpacities } : undefined,
    customLayers: cloneCustomLayers(dayData.customLayers),
  };
};

/** Applies a stored day snapshot back into Redux state during undo/redo restoration. */
const applyDaySnapshot = (state: ForecastState, snapshot: ForecastDaySnapshot, now: string) => {
  const dayData = state.forecastCycle.days[snapshot.day];
  if (!dayData) {
    state.forecastCycle.days[snapshot.day] = createEmptyOutlook(snapshot.day, now);
  }

  const targetDay = state.forecastCycle.days[snapshot.day];
  if (!targetDay) return;

  targetDay.data = cloneOutlookData(snapshot.data);
  targetDay.customLayers = cloneCustomLayers(snapshot.customLayers);
  targetDay.metadata.lowProbabilityOutlooks = [...snapshot.lowProbabilityOutlooks];
  targetDay.metadata.outlookOpacities = snapshot.outlookOpacities ? { ...snapshot.outlookOpacities } : undefined;
  targetDay.metadata.lastModified = now;
};

/** Moves the current day snapshot onto the provided history stack before a reversible edit. */
const pushHistoryEntry = (
  stack: ForecastHistoryEntry[],
  snapshot: ForecastDaySnapshot
) => {
  stack.push({
    day: snapshot.day,
    snapshot,
  });
  if (stack.length > HISTORY_LIMIT) {
    stack.shift();
  }
};

/** Saves the current day into the undo stack and clears redo after a new user edit. */
const pushUndoSnapshot = (state: ForecastState, day: DayType = state.forecastCycle.currentDay) => {
  const snapshot = getCurrentDaySnapshot(state, day);
  if (!snapshot) return;

  const dayHistory = getOrCreateDayHistory(state, snapshot.day);
  pushHistoryEntry(dayHistory.undoStack, snapshot);
  dayHistory.redoStack = [];
};

/** Clears all per-day history stacks when the editing context changes to a new document. */
const clearHistory = (state: ForecastState) => {
  state.historyByDay = {};
};

/** Clears stale package completion when forecast package content changes. */
const invalidateCompletionAcknowledgement = (state: ForecastState) => {
  if (state.forecastCycle.completionAcknowledgedAt || state.forecastCycle.omittedDayReasons) {
    delete state.forecastCycle.completionAcknowledgedAt;
    delete state.forecastCycle.omittedDayReasons;
  }
  state.completionValidation.lastResult = null;
};

interface ApplyRolloverArgs {
  sourceCycle: ForecastState['savedCycles'][number];
  sourceDayData: NonNullable<ReturnType<typeof normalizeForecastCycle>['days'][DayType]>;
  sourceDayNumber: DayType;
  targetDay: DayType;
  targetDate: string;
  workflowTemplate?: WorkflowMetadata;
}

/** Builds the fresh rollover cycle and copies the requested day into it. */
const buildRolloverCycle = ({
  sourceDayData,
  sourceDayNumber,
  targetDay,
  targetDate,
  now,
}: Omit<ApplyRolloverArgs, 'sourceCycle' | 'workflowTemplate'> & { now: string }): ForecastCycle => {
  const newCycle: ForecastCycle = {
    days: { [targetDay]: createEmptyOutlook(targetDay, now) },
    currentDay: targetDay,
    cycleDate: targetDate,
  };
  const targetDayData = newCycle.days[targetDay];
  if (targetDayData) {
    copyCompatibleOutlooks(sourceDayData.data, targetDayData.data, sourceDayNumber, targetDay);
    targetDayData.customLayers = cloneIntegratedCustomLayers(sourceDayData.customLayers);
  }
  return newCycle;
};

/**
 * Attaches workflow metadata to the rollover only when a template was passed
 * or the source cycle was already a workflow cycle. Plain rollovers stay plain.
 */
const applyRolloverWorkflowState = (
  state: ForecastState,
  { sourceCycle, targetDate, workflowTemplate }: Pick<ApplyRolloverArgs, 'sourceCycle' | 'targetDate' | 'workflowTemplate'>,
  now: string
) => {
  const sourceHadWorkflow = Boolean(sourceCycle.workflowMetadata);
  if (workflowTemplate || sourceHadWorkflow) {
    const workflowId = resolveWorkflowId(workflowTemplate, sourceCycle.workflowMetadata);
    state.workflowMetadata = createInitialCycleMetadata(workflowId, targetDate, now);
    state.isWorkflowActive = true;
    state.workflowTemplate = workflowTemplate || getWorkflowTemplateById(workflowId) || undefined;
    return;
  }
  state.workflowMetadata = undefined;
  state.isWorkflowActive = false;
  state.workflowTemplate = undefined;
};

/** Resets the in-memory cycle to a fresh rollover derived from the requested source. */
const applyRolloverFromPreviousCycle = (state: ForecastState, args: ApplyRolloverArgs, now: string) => {
  clearHistory(state);
  state.discussionDraftsByScope = {};
  state.forecastCycle = buildRolloverCycle({ ...args, now });
  advanceCycleGeneration(state);
  state.isSaved = false;
  state.outlookVersionSnapshots = [];
  applyRolloverWorkflowState(state, args, now);
};

/** Ensures low-probability metadata exists before mutating it in reducers. */
const ensureLowProbabilityOutlooks = (dayData: OutlookDay): OutlookType[] => {
  if (!dayData.metadata.lowProbabilityOutlooks) {
    dayData.metadata.lowProbabilityOutlooks = [];
  }

  return dayData.metadata.lowProbabilityOutlooks;
};

/** Returns whether a low-probability toggle would actually change the current day state. */
const canSetLowProbabilityState = (
  state: ForecastState,
  outlookType: OutlookType,
  isLow: boolean
) => {
  const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
  if (!dayData) return false;

  const lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks || [];
  const isCurrentlyLow = lowProbabilityOutlooks.includes(outlookType);

  return (isLow && !isCurrentlyLow) || (!isLow && isCurrentlyLow);
};

/** Applies a low-probability toggle for one outlook type and clears its features when enabled. */
const applyLowProbabilityState = (
  state: ForecastState,
  outlookType: OutlookType,
  isLow: boolean
) => {
  const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
  if (!dayData) return;

  const lowProbabilityOutlooks = ensureLowProbabilityOutlooks(dayData);
  const isCurrentlyLow = lowProbabilityOutlooks.includes(outlookType);

  if (isLow && !isCurrentlyLow) {
    lowProbabilityOutlooks.push(outlookType);
    dayData.data[outlookType]?.clear();
  } else if (!isLow && isCurrentlyLow) {
    dayData.metadata.lowProbabilityOutlooks = lowProbabilityOutlooks.filter((type) => type !== outlookType);
  }

  invalidateCompletionAcknowledgement(state);
  state.isSaved = false;
};

/** Moves one history snapshot to the opposite stack and restores it for undo/redo reducers. */
const restoreHistoryEntry = (
  sourceStack: ForecastHistoryEntry[],
  targetStack: ForecastHistoryEntry[],
  state: ForecastState,
  now: string
) => {
  const nextEntry = sourceStack.pop();
  if (!nextEntry) return;

  const currentSnapshot = getCurrentDaySnapshot(state);
  if (currentSnapshot) {
    pushHistoryEntry(targetStack, currentSnapshot);
  }

  applyDaySnapshot(state, nextEntry.snapshot, now);
  state.forecastCycle.currentDay = nextEntry.day;
  state.isSaved = false;
};

export const forecastSlice = createSlice({
  name: 'forecast',
  initialState,
  reducers: {
    ...createForecastOutlookReducers({
      getCurrentOutlook,
      computeOutlookType,
      computeProbability,
      buildFeatureWithProps,
      collectPendingFeatureUpdates,
      applyPendingFeatureUpdates,
      pushUndoSnapshot,
      invalidateCompletionAcknowledgement,
      createEmptyDay: createEmptyOutlook,
      readActionTimestamp,
      areTstmFeaturesEqual,
    }),

    ...createCustomLayerReducers(pushUndoSnapshot),
    ...createCustomCategoryReducers(pushUndoSnapshot),
    ...createCustomFeatureReducers(pushUndoSnapshot),

    applyPaintBucketEdit: (state, action: PayloadAction<{
      outlookType: OutlookType;
      featureId: string;
      fromProbability: string;
      action: PaintBucketEditAction;
      probabilityList: readonly string[];
    }>) => {
      const { outlookType, featureId, fromProbability, action: editAction, probabilityList } = action.payload;
      const outlookData = getCurrentOutlook(state);
      const outlookMap = outlookData[outlookType];
      if (!outlookMap) {
        return;
      }

      const result = applyPaintBucketStrategy(outlookMap, {
        outlookType,
        featureId,
        fromProbability,
        action: editAction,
        activeProbability: state.drawingState.activeProbability,
        probabilityList,
      });

      if (!result.changed) {
        return;
      }

      pushUndoSnapshot(state);
      outlookMap.clear();
      result.map.forEach((features, key) => {
        outlookMap.set(key, features);
      });
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    applyTrimmedCurrentDayOutlooks: (
      state,
      action: PayloadAction<{
        day: DayType; cycleGeneration: number; cycleDate: string;
        data: OutlookData; result: TrimOutlookDataResult;
      }>,
    ) => {
      if (state.cycleGeneration !== action.payload.cycleGeneration
        || state.forecastCycle.cycleDate !== action.payload.cycleDate) {
        return;
      }
      const dayData = state.forecastCycle.days[action.payload.day];
      if (!dayData) {
        return;
      }

      pushUndoSnapshot(state, action.payload.day);
      dayData.data = action.payload.data;
      state.lastTrimResult = action.payload.result;
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    resetForecasts: (state, action: UnknownAction) => {
      clearHistory(state);
        state.discussionDraftsByScope = {};

      // Generate today's local date so rollover prompts and resets stay aligned.
      const today = getActionLocalCalendarDate(action);

      // Completely replace forecastCycle to force re-render
      const newCycle: ForecastCycle = {
        days: {
          1: createEmptyOutlook(1, readActionTimestamp(action))
        },
        currentDay: 1,
        cycleDate: today,
      };

      state.forecastCycle = newCycle;
      advanceCycleGeneration(state);
      state.isSaved = false;
      state.outlookVersionSnapshots = [];
      state.workflowMetadata = undefined;
      state.workflowTemplate = undefined;
      state.isWorkflowActive = false;
    },

    markAsSaved: (state) => {
      state.isSaved = true;
    },

    // Restores the local auto-save snapshot. Same-session restores may retain unpublished drafts.
    restoreForecastCycle: {
      reducer: (state, action: PayloadAction<{ cycle: ForecastCycle; preserveDiscussionDrafts?: boolean }>) => {
        state.forecastCycle = action.payload.cycle;
        advanceCycleGeneration(state);
        if (!action.payload.preserveDiscussionDrafts) {
          state.discussionDraftsByScope = {};
        }
        clearHistory(state);
        state.isSaved = true;
        state.outlookVersionSnapshots = [];
        state.workflowMetadata = undefined;
        state.workflowTemplate = undefined;
        state.isWorkflowActive = false;
      },
      prepare: (cycle: ForecastCycle, preserveDiscussionDrafts = false) => ({
        payload: { cycle, preserveDiscussionDrafts },
      }),
    },

    // Import forecast data: Now handles Cycle
    importForecastCycle: (state, action: PayloadAction<ForecastCycle>) => {
      state.forecastCycle = action.payload;
      advanceCycleGeneration(state);
      state.discussionDraftsByScope = {};
      clearHistory(state);
      state.isSaved = true;
      state.outlookVersionSnapshots = [];
      // Clear workflow state when importing a plain forecast cycle
      state.workflowMetadata = undefined;
      state.workflowTemplate = undefined;
      state.isWorkflowActive = false;
    },

    // Legacy import support (Single day) -> Import into CURRENT day
    importForecasts: (state, action: PayloadAction<OutlookData>) => {
      clearHistory(state);
      const currentDay = state.forecastCycle.currentDay;
      const dayData = state.forecastCycle.days[currentDay];
      if (dayData) {
        // Preserve existing TSTM features if categorical exists
        const existingTstm = dayData.data.categorical?.get('TSTM') || [];

        // Replace current day data with imported data
        dayData.data = action.payload;

        // Merge TSTM features if categorical map exists
        if (dayData.data.categorical) {
          const importedTstm = dayData.data.categorical.get('TSTM') || [];
          const mergedTstm = [...existingTstm, ...importedTstm];
          if (mergedTstm.length > 0) {
            dayData.data.categorical.set('TSTM', mergedTstm);
          }
        }

        // Reset low probability flags for types that now have data
        if (dayData.metadata.lowProbabilityOutlooks) {
          dayData.metadata.lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks.filter(
            t => !(dayData.data[t] && dayData.data[t].size > 0)
          );
        }

        // Update metadata
        dayData.metadata.lastModified = readActionTimestamp(action);
      }
      advanceCycleGeneration(state);
      state.isSaved = true;
    },

    // Update an unsaved discussion draft without coupling it to the mounted page.
    updateDiscussionDraft: (state, action: PayloadAction<{ scopeId: string; draft: DiscussionData }>) => {
      state.discussionDraftsByScope[action.payload.scopeId] = action.payload.draft;
    },

    /** Moves unpublished drafts when discussion scopes are combined or reset. */
    migrateDiscussionDrafts: (state, action: PayloadAction<{ migrations: Record<string, string>; preferScopeId?: string }>) => {
      const { migrations, preferScopeId } = action.payload;
      const preferredDraft = preferScopeId ? state.discussionDraftsByScope[preferScopeId] : undefined;
      const nextDrafts = { ...state.discussionDraftsByScope };
      const targetsToSources = new Map<string, string[]>();

      Object.entries(migrations).forEach(([fromScopeId, toScopeId]) => {
        const sources = targetsToSources.get(toScopeId) ?? [];
        sources.push(fromScopeId);
        targetsToSources.set(toScopeId, sources);
      });

      targetsToSources.forEach((fromScopeIds, toScopeId) => {
        const sourceDrafts = fromScopeIds
          .map((scopeId) => nextDrafts[scopeId])
          .filter(Boolean) as DiscussionData[];
        const mergedDraft = mergeDiscussionDrafts(sourceDrafts, preferredDraft);
        if (mergedDraft) nextDrafts[toScopeId] = mergedDraft;
      });

      const removedScopeIds = new Set(Object.keys(migrations));
      state.discussionDraftsByScope = Object.fromEntries(
        Object.entries(nextDrafts).filter(([scopeId]) => !removedScopeIds.has(scopeId)),
      ) as Record<string, DiscussionData>;
    },

    // Update discussion for a specific day
    updateDiscussion: (state, action: PayloadAction<{ day: DayType; discussion: DiscussionData; scopeId?: string }>) => {
      const { day, discussion, scopeId } = action.payload;
      const dayData = state.forecastCycle.days[day];
      if (dayData) {
        dayData.discussion = discussion;
        dayData.metadata.lastModified = readActionTimestamp(action);
        if (scopeId) {
          const { [scopeId]: _removed, ...remainingDrafts } = state.discussionDraftsByScope;
          state.discussionDraftsByScope = remainingDrafts;
        }
        invalidateCompletionAcknowledgement(state);
        state.isSaved = false;
      }
    },

    /** Persists discussion scopes without copying discussion content into each covered day. */
    setDiscussionGroupings: (state, action: PayloadAction<DiscussionGrouping[]>) => {
      if (!isValidDiscussionGroupings(action.payload)) return;
      state.forecastCycle.discussionGroupings = normalizeDiscussionGroupings(action.payload);
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    /** Clears custom discussion scopes and restores workflow or day defaults. */
    resetDiscussionGroupings: (state) => {
      state.forecastCycle.discussionGroupings = undefined;
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    // Cycle History Management
    setForecastWorkspace: (state, action: PayloadAction<ForecastWorkspaceId>) => {
      const nextWorkspace = getForecastWorkspace(action.payload);
      if (!nextWorkspace || nextWorkspace.id === state.workspaceId) {
        return;
      }
      const previousWorkspaceId = state.workspaceId;
      state.workspaceId = nextWorkspace.id;
      // Drafts belong to the workspace that wrote them: park the outgoing
      // workspace's drafts and hand back the ones this workspace left behind,
      // so switching away and back never drops unpublished discussion text.
      const discussionDraftsByWorkspace = cloneJsonValue(state.discussionDraftsByWorkspace ?? {});
      discussionDraftsByWorkspace[previousWorkspaceId] = cloneJsonValue(state.discussionDraftsByScope);
      state.discussionDraftsByWorkspace = discussionDraftsByWorkspace;
      state.discussionDraftsByScope = cloneJsonValue(
        discussionDraftsByWorkspace[nextWorkspace.id] ?? {},
      );
      // Switching products must not leak the previous document or undo stacks
      // into the new workspace. ForecastPage restores the target workspace
      // autosave or cloud payload on top of this blank slate.
      const now = readActionTimestamp(action);
      const today = getActionLocalCalendarDate(action);
      state.forecastCycle = {
        days: {
          1: createEmptyOutlook(1, now),
        },
        currentDay: 1,
        cycleDate: today,
      };
      advanceCycleGeneration(state);
      clearHistory(state);
      state.isSaved = false;
      state.outlookVersionSnapshots = [];
      state.workflowMetadata = undefined;
      state.workflowTemplate = undefined;
      state.isWorkflowActive = false;
      state.lastTrimResult = null;
      state.autoCategoricalError = null;
      // Editor-owned state belongs to the workspace too: camera, active tool
      // settings, custom-layer selection, and the completion dialog all reset to
      // the new workspace's own defaults so the mount never starts Severe's
      // tools in another product.
      state.currentMapView = { center: [39.8283, -98.5795], zoom: 4 };
      const editorDefaults = createWorkspaceEditorDefaults(nextWorkspace.id);
      state.drawingState = editorDefaults.drawingState;
      state.customEditor = editorDefaults.customEditor;
      state.completionValidation = { lastResult: null, showCompletionModal: false, omittedDays: {} };
      invalidateCompletionAcknowledgement(state);
    },

    saveCurrentCycle: (state, action: PayloadAction<{ label?: string }>) => {
      const forecastCycleSnapshot = cloneForecastCycle(state.forecastCycle);
      const now = readActionTimestamp(action);
      const savedCycle: SavedCycle = {
        id: createSavedCycleId(state, now),
        timestamp: now,
        cycleDate: state.forecastCycle.cycleDate,
        label: action.payload.label,
        forecastCycle: forecastCycleSnapshot,
        stats: countForecastMetrics(forecastCycleSnapshot),
        workspaceId: resolveForecastWorkspaceId(state.workspaceId),
        workflowMetadata: state.workflowMetadata ? { ...state.workflowMetadata } : undefined,
      };
      state.savedCycles.push(savedCycle);
      state.lifetimeCycleStats ??= { totalCyclesMade: 0, totalForecastsMade: 0 };
      state.lifetimeCycleStats.totalCyclesMade += 1;
      state.lifetimeCycleStats.totalForecastsMade += savedCycle.stats.forecastDays;
      const lastSavedCycleDate = state.lifetimeCycleStats.lastSavedCycleDate;
      if (!lastSavedCycleDate || savedCycle.cycleDate > lastSavedCycleDate) {
        const previousDate = lastSavedCycleDate ? new Date(lastSavedCycleDate).getTime() : 0;
        const currentDate = new Date(savedCycle.cycleDate).getTime();
        const isConsecutiveDay = currentDate - previousDate === 86400000;
        state.lifetimeCycleStats.forecastStreak = isConsecutiveDay
          ? (state.lifetimeCycleStats.forecastStreak ?? 0) + 1
          : 1;
        state.lifetimeCycleStats.lastSavedCycleDate = savedCycle.cycleDate;
      } else if (!state.lifetimeCycleStats.forecastStreak) {
        state.lifetimeCycleStats.forecastStreak = 1;
      }
      if (state.savedCycles.length > SAVED_CYCLES_LIMIT) {
        state.savedCycles.splice(0, state.savedCycles.length - SAVED_CYCLES_LIMIT);
      }
      state.isSaved = true;
    },

    loadSavedCycle: (state, action: PayloadAction<string>) => {
      const cycleId = action.payload;
      const savedCycle = state.savedCycles.find(c => c.id === cycleId);
      if (savedCycle && getSavedCycleWorkspaceId(savedCycle) === resolveForecastWorkspaceId(state.workspaceId)) {
        // The route owns workspace identity: loading a saved cycle never retags
        // the active workspace. Cross-workspace opens must navigate explicitly.
        state.forecastCycle = cloneForecastCycle(normalizeForecastCycle(savedCycle.forecastCycle));
        advanceCycleGeneration(state);
        clearHistory(state);
        state.discussionDraftsByScope = {};
        state.isSaved = true;
        state.outlookVersionSnapshots = [];
        
        // Restore or clear workflow metadata
        if (savedCycle.workflowMetadata) {
          state.workflowMetadata = savedCycle.workflowMetadata;
          // Restore the workflow template from the workflowId
          state.workflowTemplate = getWorkflowTemplateById(savedCycle.workflowMetadata.workflowId) || {
            id: savedCycle.workflowMetadata.workflowId,
            label: savedCycle.workflowMetadata.workflowId,
            groupings: [],
          };
          state.isWorkflowActive = true;
        } else {
          state.workflowMetadata = undefined;
          state.workflowTemplate = undefined;
          state.isWorkflowActive = false;
        }
      }
    },

    deleteSavedCycle: (state, action: PayloadAction<string>) => {
      const cycleId = action.payload;
      const savedCycle = state.savedCycles.find((cycle) => cycle.id === cycleId);
      if (!savedCycle || getSavedCycleWorkspaceId(savedCycle) !== resolveForecastWorkspaceId(state.workspaceId)) return;
      state.savedCycles = state.savedCycles.filter((cycle) => cycle.id !== cycleId);
      // lifetimeCycleStats intentionally tracks historical saves, not the retained/deletable window.
    },

    // Copy features from one cycle/day to current cycle/day
    copyFeaturesFromPrevious: (state, action: PayloadAction<{
      sourceCycle: ForecastCycle;
      sourceDay: DayType;
      targetDay: DayType;
    }>) => {
      clearHistory(state);
      const { sourceCycle, sourceDay, targetDay } = action.payload;

      const sourceDayData = sourceCycle.days[sourceDay];
      if (!sourceDayData) {
        return;
      }

      // Ensure target day exists
      if (!state.forecastCycle.days[targetDay]) {
        state.forecastCycle.days[targetDay] = createEmptyOutlook(targetDay, readActionTimestamp(action));
      }

      const targetDayData = state.forecastCycle.days[targetDay];
      if (!targetDayData) {
        return;
      }

      clearOutlookMaps(targetDayData.data);
      copyCompatibleOutlooks(sourceDayData.data, targetDayData.data, sourceDay, targetDay);
      // Custom layers are grouping-agnostic. Copy replaces the target
      // collection with a detached clone, just like severe outlook data.
      targetDayData.customLayers = cloneIntegratedCustomLayers(sourceDayData.customLayers);

      targetDayData.metadata.lastModified = readActionTimestamp(action);
      clearHistory(state);
      state.isSaved = false;
    },

    // Load cycles from storage (for hydration)
    loadCycleHistory: (state, action: PayloadAction<SavedCycle[] | CycleHistoryLoad>) => {
      const cycles = Array.isArray(action.payload) ? action.payload : action.payload.cycles;
      state.savedCycles = cycles.slice(-SAVED_CYCLES_LIMIT).map(normalizeCycleWorkspace);
      state.lifetimeCycleStats = Array.isArray(action.payload)
        ? {
            totalCyclesMade: cycles.length,
            totalForecastsMade: cycles.reduce((total, cycle) => total + (cycle.stats.forecastDays ?? 0), 0),
          }
        : action.payload.lifetimeCycleStats;
    },

    setLowProbability: (state, action: PayloadAction<{ outlookType: OutlookType, isLow: boolean }>) => {
      const { outlookType, isLow } = action.payload;
      if (canSetLowProbabilityState(state, outlookType, isLow)) {
        pushUndoSnapshot(state);
        applyLowProbabilityState(state, outlookType, isLow);
      }
    },

    setOutlookOpacity: (state, action: PayloadAction<{ outlookType: OutlookType; opacity: number }>) => {
      const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
      if (!dayData) return;
      pushUndoSnapshot(state);
      const opacity = Number.isFinite(action.payload.opacity)
        ? Math.min(1, Math.max(0, action.payload.opacity))
        : 1;
      dayData.metadata.outlookOpacities = {
        ...(dayData.metadata.outlookOpacities || {}),
        [action.payload.outlookType]: opacity,
      };
      dayData.metadata.lastModified = readActionTimestamp(action);
      state.isSaved = false;
      invalidateCompletionAcknowledgement(state);
    },

    toggleLowProbability: (state) => {
      const outlookType = state.drawingState.activeOutlookType;
      const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
      const isCurrentlyLow = dayData?.metadata.lowProbabilityOutlooks?.includes(outlookType) || false;
      if (canSetLowProbabilityState(state, outlookType, !isCurrentlyLow)) {
        pushUndoSnapshot(state);
        applyLowProbabilityState(state, outlookType, !isCurrentlyLow);
      }
    },

    // @codescene(disable:"Complex Method")
    copyOutlookGeometryBetweenHazards: (state, action: PayloadAction<CopyOutlookGeometryOptions>) => {
      const day = state.forecastCycle.currentDay;
      if (day !== 1 && day !== 2) {
        return;
      }

      const { sourceType, targetType } = action.payload;
      if (sourceType === targetType) {
        return;
      }

      const dayData = state.forecastCycle.days[day];
      if (!dayData) {
        return;
      }

      const sourceMap = dayData.data[sourceType];
      const targetMap = dayData.data[targetType];
      if (!sourceMap || !targetMap) {
        return;
      }

      const copyableCount = countCopyableSourceFeatures({
        sourceMap,
        sourceType,
        targetType,
        day,
        probabilityFilter: action.payload.probabilityFilter,
      });
      if (copyableCount === 0) {
        return;
      }

      pushUndoSnapshot(state);
      copyOutlookGeometry(sourceMap, targetMap, action.payload, day);

      if (dayData.metadata.lowProbabilityOutlooks) {
        dayData.metadata.lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks.filter(
          (type) => type !== targetType,
        );
      }

      dayData.metadata.lastModified = readActionTimestamp(action);
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    undoLastEdit: (state, action: UnknownAction) => {
      const dayHistory = getOrCreateDayHistory(state);
      restoreHistoryEntry(dayHistory.undoStack, dayHistory.redoStack, state, readActionTimestamp(action));
    },

    redoLastEdit: (state, action: UnknownAction) => {
      const dayHistory = getOrCreateDayHistory(state);
      restoreHistoryEntry(dayHistory.redoStack, dayHistory.undoStack, state, readActionTimestamp(action));
    },

    // v2 workflow metadata reducers
    setWorkflowMetadata: (state, action: PayloadAction<CycleMetadata>) => {
      state.workflowMetadata = action.payload;
      state.workflowTemplate = getWorkflowTemplateById(action.payload.workflowId) || state.workflowTemplate;
      state.isWorkflowActive = true;
    },

    clearWorkflowMetadata: (state) => {
      state.workflowMetadata = undefined;
      state.workflowTemplate = undefined;
      state.isWorkflowActive = false;
    },

    setWorkflowTemplate: (state, action: PayloadAction<WorkflowMetadata>) => {
      state.workflowTemplate = action.payload;
    },

    importWorkflowPackage: (state, action: PayloadAction<Package>) => {
      const pkg = action.payload;
      // Import the first cycle's metadata (packages typically have one cycle)
      if (pkg.cycles.length > 0) {
        state.workflowMetadata = pkg.cycles[0];
        state.isWorkflowActive = true;
      }
      if (pkg.metadata) {
        state.workflowTemplate = getWorkflowTemplateById(pkg.metadata.workflowId) || {
          id: pkg.metadata.workflowId,
          label: pkg.metadata.workflowId,
          groupings: [],
        };
      }
      state.discussionDraftsByScope = {};
      clearHistory(state);
      state.isSaved = true;
      state.outlookVersionSnapshots = [];
    },

    // Completion validation (WF-03)
    validateCompletion: (state) => {
      const result = validateCycleCompletion(
        state.forecastCycle,
        getWorkflowValidationGroupings(state.workflowTemplate),
      );
      state.completionValidation.lastResult = result;
      state.completionValidation.omittedDays = {};
      state.completionValidation.showCompletionModal = true;
    },

    dismissCompletionModal: (state) => {
      state.completionValidation.showCompletionModal = false;
      state.completionValidation.lastResult = null;
      state.completionValidation.omittedDays = {};
    },

    omitDay: (state, action: PayloadAction<{ day: DayType; reason: string }>) => {
      const { day, reason } = action.payload;
      state.completionValidation.omittedDays[day] = reason;
    },

    completeCycle: (state, action: UnknownAction) => {
      const completedAt = readActionTimestamp(action);
      state.forecastCycle.completionAcknowledgedAt = completedAt;
      if (state.workflowMetadata) {
        state.workflowMetadata.status = 'completed';
        state.workflowMetadata.updatedAt = completedAt;
        const currentVersion = state.workflowMetadata.outlookVersions[state.workflowMetadata.outlookVersions.length - 1];
        if (currentVersion?.status === 'in-progress') currentVersion.status = 'completed';
      }
      delete state.forecastCycle.omittedDayReasons;
      delete state.forecastCycle.updateInProgressVersion;
      state.completionValidation.showCompletionModal = false;
      state.completionValidation.lastResult = null;
      state.completionValidation.omittedDays = {};
      state.isSaved = false;
    },

    completeWithOmissions: (state, action: UnknownAction) => {
      const completedAt = readActionTimestamp(action);
      state.forecastCycle.completionAcknowledgedAt = completedAt;
      if (state.workflowMetadata) {
        state.workflowMetadata.status = 'completed-with-omissions';
        state.workflowMetadata.updatedAt = completedAt;
        const currentVersion = state.workflowMetadata.outlookVersions[state.workflowMetadata.outlookVersions.length - 1];
        if (currentVersion?.status === 'in-progress') currentVersion.status = 'omitted';
      }
      state.forecastCycle.omittedDayReasons = { ...state.completionValidation.omittedDays };
      delete state.forecastCycle.updateInProgressVersion;
      state.completionValidation.showCompletionModal = false;
      state.completionValidation.lastResult = null;
      state.completionValidation.omittedDays = {};
      state.isSaved = false;
    },

    clearOmittedDays: (state) => {
      state.completionValidation.omittedDays = {};
    },

    // WF-04: Workflow entry, resume, update, and base-cycle actions

    /** Start a new blank cycle with optional workflow metadata. */
    startBlankCycle: (state, action: PayloadAction<{
      workflowTemplate?: WorkflowMetadata;
      cycleDate?: string;
    }>) => {
      const { workflowTemplate, cycleDate } = action.payload;
      clearHistory(state);
      state.discussionDraftsByScope = {};
      const now = readActionTimestamp(action);
      const today = cycleDate || getActionLocalCalendarDate(action);
      const startDay = getWorkflowStartDay(workflowTemplate);
      const newCycle: ForecastCycle = {
        days: { [startDay]: createEmptyOutlook(startDay, now) },
        currentDay: startDay,
        cycleDate: today,
      };
      state.forecastCycle = newCycle;
      advanceCycleGeneration(state);
      state.isSaved = false;
      state.outlookVersionSnapshots = [];
      
      if (workflowTemplate) {
        state.workflowTemplate = workflowTemplate;
        // Create initial cycle metadata
        state.workflowMetadata = {
          id: `WF-${workflowTemplate.id}-${today}`,
          workflowId: workflowTemplate.id,
          cycleDate: today,
          status: 'in-progress',
          outlookVersions: [{
            version: 1,
            status: 'in-progress',
            createdAt: now,
          }],
          createdAt: now,
          updatedAt: now,
        };
        state.isWorkflowActive = true;
      } else {
        // Clear stale workflow state when starting without a template
        state.workflowTemplate = undefined;
        state.workflowMetadata = undefined;
        state.isWorkflowActive = false;
      }
    },

    /** Resume an incomplete cycle from a saved snapshot, restoring workflow metadata. */
    resumeIncompleteCycle: (state, action: PayloadAction<{ cycleId: string }>) => {
      const { cycleId } = action.payload;
      const savedCycle = state.savedCycles.find((c) => c.id === cycleId);
      if (!savedCycle || getSavedCycleWorkspaceId(savedCycle) !== resolveForecastWorkspaceId(state.workspaceId)) return;

      clearHistory(state);
      state.discussionDraftsByScope = {};
      state.forecastCycle = cloneForecastCycle(normalizeForecastCycle(savedCycle.forecastCycle));
      advanceCycleGeneration(state);
      state.isSaved = true;
      state.outlookVersionSnapshots = [];
      
      // Restore or clear workflow metadata
      if (savedCycle.workflowMetadata) {
        state.workflowMetadata = savedCycle.workflowMetadata;
        // Restore the workflow template from the workflowId
        state.workflowTemplate = getWorkflowTemplateById(savedCycle.workflowMetadata.workflowId) || {
          id: savedCycle.workflowMetadata.workflowId,
          label: savedCycle.workflowMetadata.workflowId,
          groupings: [],
        };
        state.isWorkflowActive = true;
      } else {
        state.workflowMetadata = undefined;
        state.workflowTemplate = undefined;
        state.isWorkflowActive = false;
      }
    },

    /** Create a new outlook version within the current cycle (same-cycle update). */
    createOutlookUpdate: (state, action: UnknownAction) => {
      const now = readActionTimestamp(action);

      // Determine the next version number
      const currentVersions = state.workflowMetadata?.outlookVersions || [];
      const nextVersion = currentVersions.length > 0
        ? Math.max(...currentVersions.map(v => v.version)) + 1
        : 1;

      // Snapshot every day that has data so full-outlook workflows keep
      // the whole version side-by-side with the next iteration, not just
      // the currently selected day.
      const snapshotDays: typeof state.forecastCycle.days = {};
      let hasSnapshot = false;
      (Object.entries(state.forecastCycle.days) as unknown as [DayType, typeof state.forecastCycle.days[DayType]][]).forEach(
        ([day, dayData]) => {
          if (!dayData) return;
          snapshotDays[day] = {
            ...dayData,
            data: cloneOutlookData(dayData.data),
            // Version history must retain the exact geometry and appearance
            // that existed before the update, not a live reference.
            customLayers: cloneIntegratedCustomLayers(dayData.customLayers),
          };
          hasSnapshot = true;
        },
      );

      if (hasSnapshot) {
        state.outlookVersionSnapshots.push({
          version: nextVersion - 1, // Snapshot the previous version
          days: snapshotDays,
          createdAt: now,
        });
      }
      
      // Mark previous versions as completed
      if (state.workflowMetadata) {
        state.workflowMetadata.outlookVersions.forEach(v => {
          if (v.status === 'in-progress') {
            v.status = 'completed';
          }
        });
        
        // Add new version
        state.workflowMetadata.outlookVersions.push({
          version: nextVersion,
          status: 'in-progress',
          derivedFrom: nextVersion - 1,
          createdAt: now,
        });
        
        state.workflowMetadata.status = 'in-progress';
        state.workflowMetadata.updatedAt = now;
      }
      
      state.forecastCycle.updateInProgressVersion = nextVersion;
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    /** Start a new cycle derived from a previous cycle. */
    startFromPreviousCycle: (state, action: PayloadAction<{
      sourceCycleId: string;
      newCycleDate?: string;
      sourceDay?: DayType;
      targetDay?: DayType;
      workflowTemplate?: WorkflowMetadata;
    }>) => {
      const { sourceCycleId, newCycleDate, sourceDay, targetDay = 1, workflowTemplate } = action.payload;

      const sourceCycle = state.savedCycles.find(c => c.id === sourceCycleId);
      if (!sourceCycle || getSavedCycleWorkspaceId(sourceCycle) !== resolveForecastWorkspaceId(state.workspaceId)) return;

      const sourceForecastCycle = normalizeForecastCycle(sourceCycle.forecastCycle);
      const sourceDayNumber = sourceDay ?? sourceForecastCycle.currentDay;
      const sourceDayData = sourceForecastCycle.days[sourceDayNumber];
      if (!sourceDayData) return;

      applyRolloverFromPreviousCycle(state, {
        sourceCycle,
        sourceDayData,
        sourceDayNumber,
        targetDay,
        targetDate: newCycleDate || getActionLocalCalendarDate(action),
        workflowTemplate,
      }, readActionTimestamp(action));
    },

    /** Sets the editor-visible auto-categorical derivation error (null clears it). */
    setAutoCategoricalError: (state, action: PayloadAction<string | null>) => {
      state.autoCategoricalError = action.payload;
    },

    /** Hydrates the workflow-active flag from storage via the store subscription. */
    setWorkflowActive: (state, action: PayloadAction<boolean>) => {
      state.isWorkflowActive = action.payload;
    },
  }
});

export const {
  setActiveOutlookType,
  setActiveProbability,
  toggleSignificant,
  setCustomEditorMode,
  selectCustomLayer,
  selectCustomCategory,
  addCustomLayer,
  updateCustomLayerLabel,
  removeCustomLayer,
  moveCustomLayer,
  addCustomCategory,
  updateCustomCategory,
  removeCustomCategory,
  moveCustomCategory,
  addCustomFeature,
  updateCustomFeature,
  removeCustomFeature,
  addFeature,
  updateFeature,
  updateFeaturesBatch,
  removeFeature,
  applyPaintBucketEdit,
  applyTrimmedCurrentDayOutlooks,
  resetCategorical,
  setOutlookMap,
  applyAutoCategoricalSync,
  replaceTstmFeatures,
  setMapView,
  resetForecasts,
  markAsSaved,
  importForecasts,
  restoreForecastCycle,
  importForecastCycle,
  setForecastDay,
  setCycleDate,
  setEmergencyMode,
  setForecastWorkspace,
  updateDiscussionDraft,
  migrateDiscussionDrafts,
  updateDiscussion,
  setDiscussionGroupings,
  resetDiscussionGroupings,
  saveCurrentCycle,
  loadSavedCycle,
  deleteSavedCycle,
  copyFeaturesFromPrevious,
  copyOutlookGeometryBetweenHazards,
  loadCycleHistory,
  setLowProbability,
  setOutlookOpacity,
  toggleLowProbability,
  undoLastEdit,
  redoLastEdit,
  setWorkflowMetadata,
  clearWorkflowMetadata,
  setWorkflowTemplate,
  importWorkflowPackage,
  validateCompletion,
  dismissCompletionModal,
  omitDay,
  completeCycle,
  completeWithOmissions,
  clearOmittedDays,
  startBlankCycle,
  resumeIncompleteCycle,
  createOutlookUpdate,
  startFromPreviousCycle,
  setAutoCategoricalError,
  setWorkflowActive,
} = forecastSlice.actions;

/** Selects the full forecast slice. */
export const selectForecast = (state: RootState) => state.forecast;
/** Selects the active forecast cycle document. */
export const selectForecastCycle = (state: RootState) => state.forecast.forecastCycle;
/** Selects the currently active forecast day number. */
export const selectCurrentDay = (state: RootState) => state.forecast.forecastCycle.currentDay;
/** Selects one day's unsaved discussion draft, if the editor has changed it. */
export const selectDiscussionDraftForScope = (state: RootState, scopeId: string) => state.forecast.discussionDraftsByScope[scopeId];
/** Selects the outlook maps for the active day, falling back to an empty day shape when needed. */
export const selectCurrentOutlooks = (state: RootState) => {
  const cycle = state.forecast.forecastCycle;
  return cycle.days[cycle.currentDay]?.data || sharedEmptyOutlookData(cycle.currentDay) || sharedEmptyOutlookData(4)!;
  };
const EMPTY_CUSTOM_LAYERS: CustomLayerCollection = {
  schemaVersion: '1.0.0',
  layers: [],
};
/** Selects custom layers for the active forecast day, or an immutable empty value. */
export const selectCurrentCustomLayers = (state: RootState): CustomLayerCollection => {
  const cycle = state.forecast.forecastCycle;
  return cycle?.days?.[cycle.currentDay]?.customLayers || EMPTY_CUSTOM_LAYERS;
};
/** Selects the outlook maps for a specific day, falling back to a shared empty day shape when absent. */
export const selectOutlooksForDay = (state: RootState, day: DayType) => {
  const cycle = state.forecast.forecastCycle;
  return cycle.days[day]?.data || sharedEmptyOutlookData(day) || sharedEmptyOutlookData(4)!;
  };
/** Selects the saved forecast cycle snapshots shown in cycle history. */
export { WORKFLOW_ACTIVE_STORAGE_KEY } from './forecastSliceWorkspaceHelpers';
export { SAVED_CYCLES_LIMIT } from './forecastSliceWorkspaceHelpers';
export {
  selectSavedCycles,
  selectSavedCyclesForActiveWorkspace,
  selectCanUndo,
  selectCanRedo,
  selectIsLowProbability,
  selectCurrentOutlookOpacity,
  selectCompletionValidationResult,
  selectShowCompletionModal,
  selectOmittedDays,
  selectWorkflowMetadata,
  selectIsWorkflowActive,
  selectHasActiveWorkflow,
  selectWorkflowTemplate,
  selectOutlookVersionSnapshots,
  selectCurrentVersionNumber,
  selectAutoCategoricalError,
} from './forecastSliceSelectors';

export default forecastSlice.reducer;
