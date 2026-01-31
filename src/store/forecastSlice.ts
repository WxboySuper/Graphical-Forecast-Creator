import '../immerSetup';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OutlookData, OutlookType, DrawingState, ForecastCycle, DayType, OutlookDay } from '../types/outlooks';
import { GeoJSON } from 'leaflet';
import { RootState } from './index'; // Need RootState for selectors

interface ForecastState {
  forecastCycle: ForecastCycle;
  drawingState: DrawingState;
  currentMapView: {
    center: [number, number]; // [latitude, longitude]
    zoom: number;
  };
  isSaved: boolean;
  emergencyMode: boolean;
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
  emergencyMode: false
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

    setActiveProbability: (state, action: PayloadAction<any>) => {
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
      // Resets ONLY the current day's forecast
      const day = state.forecastCycle.currentDay;
      state.forecastCycle.days[day] = createEmptyOutlook(day);
      state.isSaved = false;
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
  setEmergencyMode
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

export default forecastSlice.reducer;