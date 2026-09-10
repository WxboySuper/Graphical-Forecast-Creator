import '../immerSetup';
import { createSlice, PayloadAction, type UnknownAction } from '@reduxjs/toolkit';
import { OutlookData, OutlookType, DrawingState, ForecastCycle, DayType, OutlookDay, DiscussionData, DiscussionGrouping } from '../types/outlooks';
import type { CycleMetadata, WorkflowMetadata, Package, CycleValidationResult, StandardGrouping } from '../types/workflow';
import { normalizeForecastCycle } from '../utils/outlookMapCoercion';
import type { CustomLayerCollection } from '../types/customProducts';
import type { RootState } from './index'; // Need RootState for selectors
export {
  selectForecast,
  selectForecastCycle,
  selectCurrentDay,
  selectDiscussionDraftForScope,
  selectSavedCycles,
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
} from './forecastSelectors';
import { cloneForecastCycle } from '../utils/fileUtils';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { createCustomLayerReducers } from './customLayerReducers';
import { createCustomCategoryReducers } from './customCategoryReducers';
import { createCustomFeatureReducers } from './customFeatureReducers';
import { createForecastOutlookReducers } from './forecastOutlookReducers';
import { readActionTimestamp } from './timestampMiddleware';
import { getLocalCalendarDate } from '../utils/localDate';
import { areTstmFeaturesEqual } from '../utils/tstmGeneration';
import { validateCycleCompletion } from '../utils/completionValidation';
import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';
import { isValidDiscussionGroupings, normalizeDiscussionGroupings } from '../utils/discussionGrouping';
import {
  buildFeatureWithProps,
  computeOutlookType,
  computeProbability,
} from './forecastFeatureNormalization';
import {
  clearHistory,
  getOrCreateDayHistory,
  pushUndoSnapshot,
  restoreHistoryEntry,
  type ForecastHistoryStacks,
} from './forecastHistory';
import { applyRolloverFromPreviousCycle } from './forecastRollover';
import {
  applyLowProbabilityState,
  canSetLowProbabilityState,
  invalidateCompletionAcknowledgement,
} from './forecastProbabilityState';
import { createForecastFeatureUpdateHelpers } from './forecastFeatureUpdates';
import { trimOutlookDataInPlace, type TrimOutlookDataResult } from '../utils/outlookPolygonMasking/trimOutlookData';
import type { LandMaskFeature, LandMaskStrategy } from '../utils/outlookPolygonMasking/types';
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
  createEmptyOutlook,
  getFallbackOutlookData,
  INITIAL_TIMESTAMP,
  sharedEmptyOutlookData,
} from './forecastStateFactory';
import { createInitialForecastState } from './forecastInitialState';
import { applyCreateOutlookUpdate } from './forecastVersioning';
import { applyDiscussionDraftMigrations } from './forecastDiscussionDrafts';
import { applyLegacyForecastImport } from './forecastLegacyImport';
import { applyCopyFeaturesFromPrevious } from './forecastCopy';

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
  forecastCycle: ForecastCycle;
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

/** Stores a snapshot of outlook data for a specific version within a cycle. */
interface OutlookVersionSnapshot {
  /** Version number within the cycle. */
  version: number;
  /** Snapshot of day data for this version. */
  days: Partial<Record<DayType, OutlookDay>>;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

export const SAVED_CYCLES_LIMIT = 50;
/** Storage key for the workflow-active flag; persisted by the store subscription, not by reducers. */
export const WORKFLOW_ACTIVE_STORAGE_KEY = 'gfc-active-forecast-workflow';
/** Resolves the local calendar date from an action's stamped timestamp instead of the clock. */
const getActionLocalCalendarDate = (action: UnknownAction): string =>
  getLocalCalendarDate(new Date(readActionTimestamp(action)));

/**
 * Builds a collision-free, deterministic saved-cycle id. The sequence is the
 * highest trailing number already used among saved cycles, plus one, so
 * replaying the same action sequence from the same state produces the same ids
 * while deleting a cycle can never cause a later id to collide.
 */
const createSavedCycleId = (state: ForecastState, now: string): string => {
  const highest = state.savedCycles.reduce((max, cycle) => {
    const match = /-(\d+)$/.exec(cycle.id);
    const sequence = match ? Number(match[1]) : 0;
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `cycle-${now}-${highest + 1}`;
};

/** Resolves the starting forecast day implied by a workflow template's first grouping, defaulting to day 1. */
const getWorkflowStartDay = (template?: WorkflowMetadata): DayType => {  const firstGrouping = template?.groupings[0];
  if (firstGrouping === 'day2') return 2;
  if (firstGrouping === 'day3') return 3;
  if (firstGrouping === 'day4-8') return 4;
  return 1;
};

/** Filters a template's groupings to the standard set used by completion validation, returning undefined when none qualify. */
const getWorkflowValidationGroupings = (template?: WorkflowMetadata): StandardGrouping[] | undefined => {
  const standardGroupings = (template?.groupings ?? []).filter(
    (grouping): grouping is StandardGrouping =>
      grouping === 'day1' || grouping === 'day2' || grouping === 'day3' || grouping === 'day4-8',
  );
  return standardGroupings.length > 0 ? standardGroupings : undefined;
};

const initialState = createInitialForecastState();

const {
  getCurrentOutlook,
  collectPendingFeatureUpdates,
  applyPendingFeatureUpdates,
} = createForecastFeatureUpdateHelpers(createEmptyOutlook, INITIAL_TIMESTAMP);

/** Restores one direction of history using the action timestamp and empty-day factory. */
const restoreHistoryForAction = ({
  state,
  action,
  source,
  target,
}: {
  state: ForecastState;
  action: UnknownAction;
  source: 'undoStack' | 'redoStack';
  target: 'undoStack' | 'redoStack';
}) => {
  const dayHistory = getOrCreateDayHistory(state);
  restoreHistoryEntry({
    sourceStack: dayHistory[source],
    targetStack: dayHistory[target],
    state,
    now: readActionTimestamp(action),
    createEmptyDay: createEmptyOutlook,
  });
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

    trimCurrentDayOutlooksToLand: (
      state,
      action: PayloadAction<{ strategy: LandMaskStrategy; landMask: LandMaskFeature; day?: DayType }>,
    ) => {
      const targetDay = action.payload.day ?? state.forecastCycle.currentDay;
      const dayData = state.forecastCycle.days[targetDay];
      if (!dayData) {
        return;
      }

      pushUndoSnapshot(state, targetDay);
      state.lastTrimResult = trimOutlookDataInPlace(dayData.data, action.payload.landMask, action.payload.strategy);
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
        cycleDate: today
      };

      state.forecastCycle = newCycle;
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
      applyLegacyForecastImport(state, action.payload, readActionTimestamp(action));
    },

    // Update an unsaved discussion draft without coupling it to the mounted page.
    updateDiscussionDraft: (state, action: PayloadAction<{ scopeId: string; draft: DiscussionData }>) => {
      state.discussionDraftsByScope[action.payload.scopeId] = action.payload.draft;
    },

    /** Moves unpublished drafts when discussion scopes are combined or reset. */
    migrateDiscussionDrafts: (state, action: PayloadAction<{ migrations: Record<string, string>; preferScopeId?: string }>) => {
      applyDiscussionDraftMigrations(
        state,
        action.payload.migrations,
        action.payload.preferScopeId,
      );
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
      if (savedCycle) {
        state.forecastCycle = cloneForecastCycle(normalizeForecastCycle(savedCycle.forecastCycle));
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
      state.savedCycles = state.savedCycles.filter(c => c.id !== cycleId);
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
      applyCopyFeaturesFromPrevious({
        state,
        sourceCycle,
        sourceDay,
        targetDay,
        timestamp: readActionTimestamp(action),
      });
    },

    // Load cycles from storage (for hydration)
    loadCycleHistory: (state, action: PayloadAction<SavedCycle[] | CycleHistoryLoad>) => {
      const cycles = Array.isArray(action.payload) ? action.payload : action.payload.cycles;
      state.savedCycles = cycles.slice(-SAVED_CYCLES_LIMIT);
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
      restoreHistoryForAction({ state, action, source: 'undoStack', target: 'redoStack' });
    },

    redoLastEdit: (state, action: UnknownAction) => {
      restoreHistoryForAction({ state, action, source: 'redoStack', target: 'undoStack' });
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
        cycleDate: today
      };
      state.forecastCycle = newCycle;
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
      if (!savedCycle) return;

      clearHistory(state);
      state.discussionDraftsByScope = {};
      state.forecastCycle = cloneForecastCycle(normalizeForecastCycle(savedCycle.forecastCycle));
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
      applyCreateOutlookUpdate(state, readActionTimestamp(action));
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
      if (!sourceCycle) return;

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
      }, readActionTimestamp(action), createEmptyOutlook);
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
  trimCurrentDayOutlooksToLand,
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

/** Selects the outlook maps for the active day, falling back to an empty day shape when needed. */
export const selectCurrentOutlooks = (state: RootState) => {
  const cycle = state.forecast.forecastCycle;
  return cycle.days[cycle.currentDay]?.data || sharedEmptyOutlookData(cycle.currentDay) || getFallbackOutlookData();
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
  return cycle.days[day]?.data || sharedEmptyOutlookData(day) || getFallbackOutlookData();
  };
export default forecastSlice.reducer;
