import '../immerSetup';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OutlookData, OutlookType, DrawingState, ForecastCycle, DayType, OutlookDay, DiscussionData, Probability } from '../types/outlooks';
import type { Feature } from 'geojson';
import { RootState } from './index'; // Need RootState for selectors

export interface SavedCycle {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastCycle: ForecastCycle;
}

export interface ForecastState {
  forecastCycle: ForecastCycle;
  drawingState: DrawingState;
  currentMapView: {
    center: [number, number]; // [latitude, longitude]
    zoom: number;
  };
  isSaved: boolean;
  emergencyMode: boolean;
  savedCycles: SavedCycle[];
  historyByDay: Partial<Record<DayType, ForecastHistoryStacks>>;
}

interface ForecastDaySnapshot {
  day: DayType;
  data: OutlookData;
  lowProbabilityOutlooks: OutlookType[];
}

interface ForecastHistoryEntry {
  day: DayType;
  snapshot: ForecastDaySnapshot;
}

interface ForecastHistoryStacks {
  undoStack: ForecastHistoryEntry[];
  redoStack: ForecastHistoryEntry[];
}

type DayBucket = 'day12' | 'day3' | 'day48';

interface OutlookCopyInstruction {
  sourceType: OutlookType;
  targetType: OutlookType;
}

const HISTORY_LIMIT = 50;
const ALL_OUTLOOK_TYPES: OutlookType[] = [
  'tornado',
  'wind',
  'hail',
  'categorical',
  'totalSevere',
  'day4-8',
];
const DIRECT_DAY12_COPY_TYPES: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical'];
const COPY_FEATURE_RULES: Record<DayBucket, Record<DayBucket, OutlookCopyInstruction[]>> = {
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
const getDayBucket = (day: DayType): DayBucket => {
  if (day === 1 || day === 2) {
    return 'day12';
  }
  if (day === 3) {
    return 'day3';
  }
  return 'day48';
};

/** Clears every supported outlook map on a target day before incoming copy operations. */
const clearOutlookMaps = (data: OutlookData) => {
  ALL_OUTLOOK_TYPES.forEach((type) => {
    data[type]?.clear();
  });
};

/** Deep-clones one probability map so undo/redo snapshots do not share mutable arrays. */
const cloneEntries = (map?: Map<string, Feature[]>): Map<string, Feature[]> | undefined => {
  if (!map) return undefined;
  return new Map(Array.from(map.entries(), ([probability, features]) => [
    probability,
    features.map(f => ({ ...f })),
  ]));
};

/** Copies only the outlook types allowed by the source/target day compatibility rules. */
const copyCompatibleOutlooks = (
  sourceData: OutlookData,
  targetData: OutlookData,
  sourceDay: DayType,
  targetDay: DayType
) => {
  const copyInstructions = COPY_FEATURE_RULES[getDayBucket(sourceDay)][getDayBucket(targetDay)];
  copyInstructions.forEach(({ sourceType, targetType }) => {
    const sourceMap = sourceData[sourceType];
    const clonedMap = cloneEntries(sourceMap);
    if (clonedMap && targetData[targetType]) {
      targetData[targetType] = clonedMap;
    }
  });
};

/** Creates an empty forecast day with the outlook maps supported for that day number. */
const createEmptyOutlook = (day: DayType): OutlookDay => {
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
      issueDate: new Date().toISOString(),
      validDate: new Date().toISOString(),
      issuanceTime: '0600',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      lowProbabilityOutlooks: []
    }
  };
};

const initialState: ForecastState = {
  forecastCycle: {
    days: {
      1: createEmptyOutlook(1)
    },
    currentDay: 1,
    cycleDate: new Date().toISOString().split('T')[0]
  },
  drawingState: {
    // Start with tornado for Day 1/2 (default day)
    activeOutlookType: 'tornado',
    activeProbability: '2%',
    isSignificant: false
  },
  currentMapView: {
    center: [39.8283, -98.5795],
    zoom: 4
  },
  isSaved: true,
  emergencyMode: false,
  savedCycles: [],
  historyByDay: {}
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
const getCurrentOutlook = (state: ForecastState): OutlookData => {
  const day = state.forecastCycle.days[state.forecastCycle.currentDay];
  if (!day) {
    // Should not happen if logic is correct, but safe fallback
    return createEmptyOutlook(state.forecastCycle.currentDay).data;
  }
  return day.data;
};

/** Recursively clones plain JSON-like values used inside GeoJSON features. */
const cloneJsonValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)])
    ) as T;
  }

  return value;
};

/** Clones one GeoJSON feature without JSON serialization so history snapshots are cheaper. */
const cloneFeature = (feature: Feature): Feature => cloneJsonValue(feature);

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
    features.map(cloneFeature),
  ]));
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

/** Captures the current day's drawable outlook data and low-probability metadata for history. */
const getCurrentDaySnapshot = (state: ForecastState): ForecastDaySnapshot | null => {
  const currentDay = state.forecastCycle.currentDay;
  const dayData = state.forecastCycle.days[currentDay];
  if (!dayData) return null;

  return {
    day: currentDay,
    data: cloneOutlookData(dayData.data),
    lowProbabilityOutlooks: [...(dayData.metadata.lowProbabilityOutlooks || [])],
  };
};

/** Applies a stored day snapshot back into Redux state during undo/redo restoration. */
const applyDaySnapshot = (state: ForecastState, snapshot: ForecastDaySnapshot) => {
  const dayData = state.forecastCycle.days[snapshot.day];
  if (!dayData) {
    state.forecastCycle.days[snapshot.day] = createEmptyOutlook(snapshot.day);
  }

  const targetDay = state.forecastCycle.days[snapshot.day];
  if (!targetDay) return;

  targetDay.data = cloneOutlookData(snapshot.data);
  targetDay.metadata.lowProbabilityOutlooks = [...snapshot.lowProbabilityOutlooks];
  targetDay.metadata.lastModified = new Date().toISOString();
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
const pushUndoSnapshot = (state: ForecastState) => {
  const snapshot = getCurrentDaySnapshot(state);
  if (!snapshot) return;

  const dayHistory = getOrCreateDayHistory(state, snapshot.day);
  pushHistoryEntry(dayHistory.undoStack, snapshot);
  dayHistory.redoStack = [];
};

/** Clears all per-day history stacks when the editing context changes to a new document. */
const clearHistory = (state: ForecastState) => {
  state.historyByDay = {};
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

  state.isSaved = false;
};

/** Moves one history snapshot to the opposite stack and restores it for undo/redo reducers. */
const restoreHistoryEntry = (
  sourceStack: ForecastHistoryEntry[],
  targetStack: ForecastHistoryEntry[],
  state: ForecastState
) => {
  const nextEntry = sourceStack.pop();
  if (!nextEntry) return;

  const currentSnapshot = getCurrentDaySnapshot(state);
  if (currentSnapshot) {
    pushHistoryEntry(targetStack, currentSnapshot);
  }

  applyDaySnapshot(state, nextEntry.snapshot);
  state.forecastCycle.currentDay = nextEntry.day;
  state.isSaved = false;
};

export const forecastSlice = createSlice({
  name: 'forecast',
  initialState,
  reducers: {
    // Set active day
    setForecastDay: (state, action: PayloadAction<DayType>) => {
      const newDay = action.payload;
      if (!state.forecastCycle.days[newDay]) {
        state.forecastCycle.days[newDay] = createEmptyOutlook(newDay);
      }
      state.forecastCycle.currentDay = newDay;
      state.isSaved = false;
    },

    // Update cycle date
    setCycleDate: (state, action: PayloadAction<string>) => {
      state.forecastCycle.cycleDate = action.payload;
      state.isSaved = false;
    },

    // Set the active outlook type for drawing
    setActiveOutlookType: (state, action: PayloadAction<OutlookType>) => {
        state.drawingState.activeOutlookType = action.payload;

        // Set default probability based on outlook type
        if (action.payload === 'tornado') {
          state.drawingState.activeProbability = '2%';
        } else if (action.payload === 'wind' || action.payload === 'hail') {
          state.drawingState.activeProbability = '5%';
        } else if (action.payload === 'totalSevere') {
          state.drawingState.activeProbability = '5%';
        } else if (action.payload === 'day4-8') {
          state.drawingState.activeProbability = '15%';
        } else if (action.payload === 'categorical') {
          state.drawingState.activeProbability = 'MRGL';
        }

        state.isSaved = false;
      },

      setEmergencyMode: (state, action: PayloadAction<boolean>) => {
        state.emergencyMode = action.payload;
    },

    setActiveProbability: (state, action: PayloadAction<Probability>) => {
      state.drawingState.activeProbability = action.payload;
      if (typeof action.payload === 'string') {
        state.drawingState.isSignificant = action.payload.includes('#');
      }
      state.isSaved = false;
    },

    toggleSignificant: (state) => {
      state.drawingState.isSignificant = false;
    },

    addFeature: (state, action: PayloadAction<{ feature: Feature }>) => {
      const feature = action.payload.feature;
      const outlookType = computeOutlookType(feature, state);
      const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
      if (!dayData) return;

      const outlookData = dayData.data;
      const outlookMap = outlookData[outlookType];
      if (!outlookMap) {
        return;
      }

      const probability = computeProbability(feature, state);
      pushUndoSnapshot(state);

      // If we're adding a feature, this outlook is no longer "Low Probability"
      if (dayData.metadata.lowProbabilityOutlooks) {
        dayData.metadata.lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks.filter(
          t => t !== outlookType
        );
      }

      const existingFeatures = outlookMap.get(probability) || [];

      const featureWithProps = buildFeatureWithProps(
        feature,
        outlookType,
        probability,
        state.drawingState.isSignificant
      );

      outlookMap.set(probability, [...existingFeatures, featureWithProps]);
      state.isSaved = false;
    },

    updateFeature: (state, action: PayloadAction<{ feature: Feature }>) => {
      const feature = action.payload.feature;
      const outlookType = (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;
      const probability = (feature.properties?.probability as string) || state.drawingState.activeProbability;

      const outlookData = getCurrentOutlook(state);
      const outlookMap = outlookData[outlookType];

      if (!outlookMap) {
        return;
      }

      const features = outlookMap.get(probability);

      if (features) {
        const index = features.findIndex(f => f.id === feature.id);
        if (index !== -1) {
          pushUndoSnapshot(state);
          features[index] = {
            ...features[index],
            geometry: feature.geometry,
            properties: {
              ...features[index].properties,
              ...feature.properties
            }
          };
          state.isSaved = false;
        }
      }
    },

    removeFeature: (state, action: PayloadAction<{
      outlookType: OutlookType,
      probability: string,
      featureId: string
    }>) => {
      const { outlookType, probability, featureId } = action.payload;
      const outlookData = getCurrentOutlook(state);
      const outlookMap = outlookData[outlookType];

      if (!outlookMap) {
        return;
      }

      const features = outlookMap.get(probability);

      if (features) {
        const featureIndex = features.findIndex(feature => feature.id === featureId);
        if (featureIndex === -1) {
          return;
        }

        pushUndoSnapshot(state);
        const updatedFeatures = features.filter(feature =>
          feature.id !== featureId
        );

        if (updatedFeatures.length > 0) {
          outlookMap.set(probability, updatedFeatures);
        } else {
          outlookMap.delete(probability);
        }

        state.isSaved = false;
      }
    },

    resetCategorical: (state) => {
      const outlooks = getCurrentOutlook(state);
      if (!outlooks.categorical) {
        return; // No categorical map for this day (e.g., Day 4-8)
      }
      const categoricalTypes = Array.from(outlooks.categorical.keys());
      if (categoricalTypes.every((type) => type === 'TSTM')) {
        return;
      }

      const tstmFeatures = outlooks.categorical.get('TSTM') || [];
      pushUndoSnapshot(state);
      outlooks.categorical = new Map();
      if (tstmFeatures.length > 0) {
        outlooks.categorical.set('TSTM', tstmFeatures);
      }
      state.isSaved = false;
    },

    setOutlookMap: (state, action: PayloadAction<{
      outlookType: OutlookType,
      map: Map<string, Feature[]>
    }>) => {
      const { outlookType, map } = action.payload;
      const outlookData = getCurrentOutlook(state);

      // Check if outlook type is supported for current day
      if (outlookData[outlookType] !== undefined || outlookType === 'categorical' ||
          outlookType === 'tornado' || outlookType === 'wind' || outlookType === 'hail' ||
          outlookType === 'totalSevere' || outlookType === 'day4-8') {
        if (outlookData[outlookType] === map) {
          return;
        }

        pushUndoSnapshot(state);
        // @ts-ignore - Dynamic property assignment
        outlookData[outlookType] = map;
        state.isSaved = false;
      }
    },

    applyAutoCategoricalSync: (state, action: PayloadAction<{ map: Map<string, Feature[]> }>) => {
      const outlookData = getCurrentOutlook(state);
      if (!outlookData.categorical) {
        return;
      }

      outlookData.categorical = action.payload.map;
      state.isSaved = false;
    },

    setMapView: (state, action: PayloadAction<{ center: [number, number], zoom: number }>) => {
      state.currentMapView = action.payload;
    },

    resetForecasts: (state) => {
      clearHistory(state);
      // Clear localStorage first
      try {
        localStorage.removeItem('forecastData');
      } catch {
        // Ignore localStorage clear errors
      }

      // Generate today's date
      const today = new Date().toISOString().split('T')[0];

      // Completely replace forecastCycle to force re-render
      const newCycle: ForecastCycle = {
        days: {
          1: createEmptyOutlook(1)
        },
        currentDay: 1,
        cycleDate: today
      };

      state.forecastCycle = newCycle;
      state.isSaved = false;
    },

    markAsSaved: (state) => {
      state.isSaved = true;
    },

    // Import forecast data: Now handles Cycle
    importForecastCycle: (state, action: PayloadAction<ForecastCycle>) => {
      state.forecastCycle = action.payload;
      clearHistory(state);
      state.isSaved = true;
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
          const typesWithData = Object.entries(dayData.data)
            .filter(([_, map]) => map && map.size > 0)
            .map(([type]) => type as OutlookType);

          dayData.metadata.lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks.filter(
            t => !typesWithData.includes(t)
          );
        }

        // Update metadata
        dayData.metadata.lastModified = new Date().toISOString();
      }
      state.isSaved = true;
    },

    // Update discussion for a specific day
    updateDiscussion: (state, action: PayloadAction<{ day: DayType; discussion: DiscussionData }>) => {
      const { day, discussion } = action.payload;
      const dayData = state.forecastCycle.days[day];
      if (dayData) {
        dayData.discussion = discussion;
        dayData.metadata.lastModified = new Date().toISOString();
        state.isSaved = false;
      }
    },

    // Cycle History Management
    saveCurrentCycle: (state, action: PayloadAction<{ label?: string }>) => {
      const savedCycle: SavedCycle = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        cycleDate: state.forecastCycle.cycleDate,
        label: action.payload.label,
        forecastCycle: JSON.parse(JSON.stringify(state.forecastCycle))
      };
      state.savedCycles.push(savedCycle);
      state.isSaved = true;
    },

    loadSavedCycle: (state, action: PayloadAction<string>) => {
      const cycleId = action.payload;
      const savedCycle = state.savedCycles.find(c => c.id === cycleId);
      if (savedCycle) {
        state.forecastCycle = JSON.parse(JSON.stringify(savedCycle.forecastCycle));
        clearHistory(state);
        state.isSaved = true;
      }
    },

    deleteSavedCycle: (state, action: PayloadAction<string>) => {
      const cycleId = action.payload;
      state.savedCycles = state.savedCycles.filter(c => c.id !== cycleId);
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
        state.forecastCycle.days[targetDay] = createEmptyOutlook(targetDay);
      }

      const targetDayData = state.forecastCycle.days[targetDay];
      if (!targetDayData) {
        return;
      }

      clearOutlookMaps(targetDayData.data);
      copyCompatibleOutlooks(sourceDayData.data, targetDayData.data, sourceDay, targetDay);

      targetDayData.metadata.lastModified = new Date().toISOString();
      clearHistory(state);
      state.isSaved = false;
    },

    // Load cycles from storage (for hydration)
    loadCycleHistory: (state, action: PayloadAction<SavedCycle[]>) => {
      state.savedCycles = action.payload;
    },

    setLowProbability: (state, action: PayloadAction<{ outlookType: OutlookType, isLow: boolean }>) => {
      const { outlookType, isLow } = action.payload;
      if (canSetLowProbabilityState(state, outlookType, isLow)) {
        pushUndoSnapshot(state);
        applyLowProbabilityState(state, outlookType, isLow);
      }
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

    undoLastEdit: (state) => {
      const dayHistory = getOrCreateDayHistory(state);
      restoreHistoryEntry(dayHistory.undoStack, dayHistory.redoStack, state);
    },

    redoLastEdit: (state) => {
      const dayHistory = getOrCreateDayHistory(state);
      restoreHistoryEntry(dayHistory.redoStack, dayHistory.undoStack, state);
    }
  }
});

export const {
  setActiveOutlookType,
  setActiveProbability,
  toggleSignificant,
  addFeature,
  updateFeature,
  removeFeature,
  resetCategorical,
  setOutlookMap,
  applyAutoCategoricalSync,
  setMapView,
  resetForecasts,
  markAsSaved,
  importForecasts,
  importForecastCycle,
  setForecastDay,
  setCycleDate,
  setEmergencyMode,
  updateDiscussion,
  saveCurrentCycle,
  loadSavedCycle,
  deleteSavedCycle,
  copyFeaturesFromPrevious,
  loadCycleHistory,
  setLowProbability,
  toggleLowProbability,
  undoLastEdit,
  redoLastEdit
} = forecastSlice.actions;

/** Selects the full forecast slice. */
export const selectForecast = (state: RootState) => state.forecast;
/** Selects the active forecast cycle document. */
export const selectForecastCycle = (state: RootState) => state.forecast.forecastCycle;
/** Selects the currently active forecast day number. */
export const selectCurrentDay = (state: RootState) => state.forecast.forecastCycle.currentDay;
/** Selects the outlook maps for the active day, falling back to an empty day shape when needed. */
export const selectCurrentOutlooks = (state: RootState) => {
  const cycle = state.forecast.forecastCycle;
  return cycle.days[cycle.currentDay]?.data || createEmptyOutlook(cycle.currentDay).data;
};
/** Selects the outlook maps for a specific day, falling back to an empty day shape when absent. */
export const selectOutlooksForDay = (state: RootState, day: DayType) => {
  const cycle = state.forecast.forecastCycle;
  return cycle.days[day]?.data || createEmptyOutlook(day).data;
};
/** Selects the saved forecast cycle snapshots shown in cycle history. */
export const selectSavedCycles = (state: RootState) => state.forecast.savedCycles;
/** Returns whether there is at least one reversible edit available. */
export const selectCanUndo = (state: RootState) => {
  const dayHistory = state.forecast.historyByDay[state.forecast.forecastCycle.currentDay];
  return (dayHistory?.undoStack?.length ?? 0) > 0;
};
/** Returns whether there is at least one redo entry available. */
export const selectCanRedo = (state: RootState) => {
  const dayHistory = state.forecast.historyByDay[state.forecast.forecastCycle.currentDay];
  return (dayHistory?.redoStack?.length ?? 0) > 0;
};

/** Returns whether the active outlook type is currently marked as low probability. */
export const selectIsLowProbability = (state: RootState) => {
  const cycle = state.forecast.forecastCycle;
  const day = cycle.days[cycle.currentDay];
  const activeType = state.forecast.drawingState.activeOutlookType;
  return day?.metadata?.lowProbabilityOutlooks?.includes(activeType) || false;
};

export default forecastSlice.reducer;
