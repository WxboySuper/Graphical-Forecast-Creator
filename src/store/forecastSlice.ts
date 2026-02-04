import '../immerSetup';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OutlookData, OutlookType, DrawingState, ForecastCycle, DayType, OutlookDay, DiscussionData, Probability } from '../types/outlooks';
import { GeoJSON } from 'leaflet';
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
  isLowProbability: boolean;
}

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
      lastModified: new Date().toISOString()
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
  isLowProbability: false
};

// Helpers to keep reducers small and testable
const computeOutlookType = (feature: GeoJSON.Feature, state: ForecastState): OutlookType => {
  return (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;
};

const computeProbability = (feature: GeoJSON.Feature, state: ForecastState): string => {
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

const buildFeatureWithProps = (
  feature: GeoJSON.Feature,
  outlookType: OutlookType,
  probability: string,
  isSignificant: boolean
): GeoJSON.Feature => {
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
  } as GeoJSON.Feature;
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

    addFeature: (state, action: PayloadAction<{ feature: GeoJSON.Feature }>) => {
      const feature = action.payload.feature;
      const outlookType = computeOutlookType(feature, state);
      const probability = computeProbability(feature, state);

      const outlookData = getCurrentOutlook(state);
      const outlookMap = outlookData[outlookType];
      
      if (!outlookMap) {
        // Outlook type not supported for this day, skip
        console.warn(`Outlook type ${outlookType} not supported for day ${state.forecastCycle.currentDay}`);
        return;
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
    
    updateFeature: (state, action: PayloadAction<{ feature: GeoJSON.Feature }>) => {
      const feature = action.payload.feature;
      const outlookType = (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;
      const probability = (feature.properties?.probability as string) || state.drawingState.activeProbability;
      
      const outlookData = getCurrentOutlook(state);
      const outlookMap = outlookData[outlookType];
      
      if (!outlookMap) {
        console.warn(`Outlook type ${outlookType} not supported for day ${state.forecastCycle.currentDay}`);
        return;
      }
      
      const features = outlookMap.get(probability);
      
      if (features) {
        const index = features.findIndex(f => f.id === feature.id);
        if (index !== -1) {
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
        console.warn(`Outlook type ${outlookType} not supported for day ${state.forecastCycle.currentDay}`);
        return;
      }
      
      const features = outlookMap.get(probability);
      
      if (features) {
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
      const tstmFeatures = outlooks.categorical.get('TSTM') || [];
      outlooks.categorical = new Map();
      if (tstmFeatures.length > 0) {
        outlooks.categorical.set('TSTM', tstmFeatures);
      }
      state.isSaved = false;
    },

    setOutlookMap: (state, action: PayloadAction<{ 
      outlookType: OutlookType, 
      map: Map<string, GeoJSON.Feature[]> 
    }>) => {
      const { outlookType, map } = action.payload;
      const outlookData = getCurrentOutlook(state);
      
      // Check if outlook type is supported for current day
      if (outlookData[outlookType] !== undefined || outlookType === 'categorical' || 
          outlookType === 'tornado' || outlookType === 'wind' || outlookType === 'hail' ||
          outlookType === 'totalSevere' || outlookType === 'day4-8') {
        // @ts-ignore - Dynamic property assignment
        outlookData[outlookType] = map;
        state.isSaved = false;
      } else {
        console.warn(`Outlook type ${outlookType} not supported for day ${state.forecastCycle.currentDay}`);
      }
    },
    
    setMapView: (state, action: PayloadAction<{ center: [number, number], zoom: number }>) => {
      state.currentMapView = action.payload;
    },
    
    resetForecasts: (state) => {
      // Clear localStorage first
      try {
        localStorage.removeItem('forecastData');
        console.log('Cleared localStorage');
      } catch (e) {
        console.error('Failed to clear localStorage:', e);
      }
      
      // Generate today's date
      const today = new Date().toISOString().split('T')[0];
      console.log('Resetting to new cycle with date:', today);
      
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
      
      console.log('State after reset:', JSON.stringify(state.forecastCycle));
    },
    
    markAsSaved: (state) => {
      state.isSaved = true;
    },

    // Import forecast data: Now handles Cycle
    importForecastCycle: (state, action: PayloadAction<ForecastCycle>) => {
      state.forecastCycle = action.payload;
      state.isSaved = true;
    },

    // Legacy import support (Single day) -> Import into CURRENT day
    importForecasts: (state, action: PayloadAction<OutlookData>) => {
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
      const { sourceCycle, sourceDay, targetDay } = action.payload;
      
      const sourceDayData = sourceCycle.days[sourceDay];
      if (!sourceDayData) {
        console.warn(`Source day ${sourceDay} not found in cycle`);
        return;
      }

      // Ensure target day exists
      if (!state.forecastCycle.days[targetDay]) {
        state.forecastCycle.days[targetDay] = createEmptyOutlook(targetDay);
      }

      const targetDayData = state.forecastCycle.days[targetDay]!;
      
      // Determine source and target day types
      const isSourceDay12 = sourceDay === 1 || sourceDay === 2;
      const isSourceDay3 = sourceDay === 3;
      const isSourceDay48 = sourceDay >= 4 && sourceDay <= 8;
      
      const isTargetDay12 = targetDay === 1 || targetDay === 2;
      const isTargetDay3 = targetDay === 3;
      const isTargetDay48 = targetDay >= 4 && targetDay <= 8;
      
      // Clear target day data first
      Object.keys(targetDayData.data).forEach((key) => {
        const outlookType = key as OutlookType;
        // @ts-ignore
        targetDayData.data[outlookType]?.clear();
      });
      
      // Conversion logic based on day types
      if (isSourceDay12 && isTargetDay12) {
        // Day 1/2 → Day 1/2: Direct copy of tornado, wind, hail, categorical
        ['tornado', 'wind', 'hail', 'categorical'].forEach(type => {
          const sourceMap = sourceDayData.data[type as OutlookType];
          if (sourceMap) {
            // @ts-ignore
            targetDayData.data[type] = new Map(Array.from(sourceMap).map(([prob, features]) => 
              [prob, features.map(f => ({...f}))]
            ));
          }
        });
      } else if (isSourceDay12 && isTargetDay3) {
        // Day 1/2 → Day 3: Only copy categorical (can't convert tornado/wind/hail to totalSevere)
        const categoricalMap = sourceDayData.data.categorical;
        if (categoricalMap && targetDayData.data.categorical) {
          targetDayData.data.categorical = new Map(Array.from(categoricalMap).map(([prob, features]) => 
            [prob, features.map(f => ({...f}))]
          ));
        }
      } else if (isSourceDay12 && isTargetDay48) {
        // Day 1/2 → Day 4-8: Skip all (Day 4-8 has no compatible outlook types)
        console.warn('Cannot copy Day 1/2 outlooks to Day 4-8 - incompatible outlook types');
      } else if (isSourceDay3 && isTargetDay12) {
        // Day 3 → Day 1/2: Only copy categorical
        const categoricalMap = sourceDayData.data.categorical;
        if (categoricalMap && targetDayData.data.categorical) {
          targetDayData.data.categorical = new Map(Array.from(categoricalMap).map(([prob, features]) => 
            [prob, features.map(f => ({...f}))]
          ));
        }
      } else if (isSourceDay3 && isTargetDay3) {
        // Day 3 → Day 3: Direct copy of totalSevere and categorical
        const totalSevereMap = sourceDayData.data.totalSevere;
        const categoricalMap = sourceDayData.data.categorical;
        
        if (totalSevereMap && targetDayData.data.totalSevere) {
          targetDayData.data.totalSevere = new Map(Array.from(totalSevereMap).map(([prob, features]) => 
            [prob, features.map(f => ({...f}))]
          ));
        }
        
        if (categoricalMap && targetDayData.data.categorical) {
          targetDayData.data.categorical = new Map(Array.from(categoricalMap).map(([prob, features]) => 
            [prob, features.map(f => ({...f}))]
          ));
        }
      } else if (isSourceDay3 && isTargetDay48) {
        // Day 3 → Day 4-8: Skip all (incompatible)
        console.warn('Cannot copy Day 3 outlooks to Day 4-8 - incompatible outlook types');
      } else if (isSourceDay48 && isTargetDay12) {
        // Day 4-8 → Day 1/2: Skip all (incompatible)
        console.warn('Cannot copy Day 4-8 outlooks to Day 1/2 - incompatible outlook types');
      } else if (isSourceDay48 && isTargetDay3) {
        // Day 4-8 → Day 3: Convert day4-8 to totalSevere (both use 15% and 30%)
        const day48Map = sourceDayData.data['day4-8'];
        
        if (day48Map && targetDayData.data.totalSevere) {
          targetDayData.data.totalSevere = new Map(Array.from(day48Map).map(([prob, features]) => 
            [prob, features.map(f => ({...f}))]
          ));
        }
      } else if (isSourceDay48 && isTargetDay48) {
        // Day 4-8 → Day 4-8: Direct copy of day4-8
        const day48Map = sourceDayData.data['day4-8'];
        
        if (day48Map && targetDayData.data['day4-8']) {
          targetDayData.data['day4-8'] = new Map(Array.from(day48Map).map(([prob, features]) => 
            [prob, features.map(f => ({...f}))]
          ));
        }
      }

      targetDayData.metadata.lastModified = new Date().toISOString();
      state.isSaved = false;
    },

    // Load cycles from storage (for hydration)
    loadCycleHistory: (state, action: PayloadAction<SavedCycle[]>) => {
      state.savedCycles = action.payload;
    },

    setLowProbability: (state, action: PayloadAction<boolean>) => {
      state.isLowProbability = action.payload;
    },

    toggleLowProbability: (state) => {
      state.isLowProbability = !state.isLowProbability;
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
  toggleLowProbability
} = forecastSlice.actions;

// Selectors
export const selectForecast = (state: RootState) => state.forecast;
export const selectForecastCycle = (state: RootState) => state.forecast.forecastCycle;
export const selectCurrentDay = (state: RootState) => state.forecast.forecastCycle.currentDay;
export const selectCurrentOutlooks = (state: RootState) => {
  const cycle = state.forecast.forecastCycle;
  return cycle.days[cycle.currentDay]?.data || createEmptyOutlook(cycle.currentDay).data;
};
export const selectOutlooksForDay = (state: RootState, day: DayType) => {
  const cycle = state.forecast.forecastCycle;
  return cycle.days[day]?.data || createEmptyOutlook(day).data;
};
export const selectSavedCycles = (state: RootState) => state.forecast.savedCycles;

export default forecastSlice.reducer;