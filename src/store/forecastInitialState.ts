import type { ForecastState } from './forecastSlice';
import {
  createEmptyOutlook,
  INITIAL_CYCLE_DATE,
  INITIAL_TIMESTAMP,
} from './forecastStateFactory';

/** Builds the deterministic state used before the first forecast action. */
export const createInitialForecastState = (): ForecastState => ({
  forecastCycle: {
    days: {
      1: createEmptyOutlook(1, INITIAL_TIMESTAMP),
    },
    currentDay: 1,
    cycleDate: INITIAL_CYCLE_DATE,
  },
  drawingState: {
    activeOutlookType: 'tornado',
    activeProbability: '2%',
    isSignificant: false,
  },
  customEditor: {
    mode: 'severe',
    activeLayerId: null,
    activeCategoryId: null,
  },
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
