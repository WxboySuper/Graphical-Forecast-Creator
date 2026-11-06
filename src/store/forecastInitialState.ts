import type { ForecastState } from './forecastSlice';
import { DEFAULT_FORECAST_WORKSPACE } from '../config/forecastWorkspaces';
import {
  createEmptyOutlook,
  INITIAL_CYCLE_DATE,
  INITIAL_TIMESTAMP,
} from './forecastStateFactory';
import { createWorkspaceEditorDefaults } from './forecastSliceWorkspaceHelpers';

/** Builds the deterministic state used before the first forecast action. */
export const createInitialForecastState = (): ForecastState => ({
  cycleGeneration: 1,
  workspaceId: DEFAULT_FORECAST_WORKSPACE,
  forecastCycle: {
    days: {
      1: createEmptyOutlook(1, INITIAL_TIMESTAMP),
    },
    currentDay: 1,
    cycleDate: INITIAL_CYCLE_DATE,
  },
  ...createWorkspaceEditorDefaults(DEFAULT_FORECAST_WORKSPACE),
  currentMapView: {
    center: [39.8283, -98.5795],
    zoom: 4,
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
});
