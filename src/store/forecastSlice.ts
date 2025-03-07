import '../immerSetup';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OutlookData, OutlookType, DrawingState } from '../types/outlooks';
import { GeoJSON } from 'leaflet';
import { getFirstEnabledOutlookType, isAnyOutlookEnabled } from '../utils/featureFlagsUtils';
import { store } from './index';

interface ForecastState {
  outlooks: OutlookData;
  drawingState: DrawingState;
  currentMapView: {
    center: [number, number]; // [latitude, longitude]
    zoom: number;
  };
  isSaved: boolean;
  emergencyMode: boolean;
}

// Helper function to get initial outlook type based on feature flags
const getInitialOutlookType = (): OutlookType => {
  // Access feature flags from the store
  const featureFlags = store.getState().featureFlags;
  return getFirstEnabledOutlookType(featureFlags);
};

// Helper function to get initial probability based on outlook type
const getInitialProbability = (outlookType: OutlookType): "TSTM" | "MRGL" | "SLGT" | "ENH" | "MDT" | "HIGH" | "2%" | "5%" | "10%" | "10#" | "15%" | "15#" | "30%" | "30#" | "45%" | "45#" | "60%" | "60#" => {
  switch (outlookType) {
    case 'tornado':
      return '2%';
    case 'wind':
    case 'hail':
      return '5%';
    case 'categorical':
    default:
      return 'MRGL';
  }
};

const initialState: ForecastState = {
  outlooks: {
    tornado: new Map(),
    wind: new Map(),
    hail: new Map(),
    categorical: new Map()
  },
  drawingState: {
    activeOutlookType: getInitialOutlookType(),
    activeProbability: '2%',
    isSignificant: false
  },
  currentMapView: {
    center: [39.8283, -98.5795], // Geographic center of the contiguous United States
    zoom: 4
  },
  isSaved: true,
  emergencyMode: false
};

// Initialize the probability based on the initial outlook type
initialState.drawingState.activeProbability = getInitialProbability(initialState.drawingState.activeOutlookType);

export const forecastSlice = createSlice({
  name: 'forecast',
  initialState,
  reducers: {
    // Set the active outlook type for drawing (tornado, wind, hail, categorical)
    setActiveOutlookType: (state, action: PayloadAction<OutlookType>) => {
      const featureFlags = store.getState().featureFlags;
      const isEnabled = (() => {
        switch (action.payload) {
          case 'tornado': return featureFlags.tornadoOutlookEnabled;
          case 'wind': return featureFlags.windOutlookEnabled;
          case 'hail': return featureFlags.hailOutlookEnabled;
          case 'categorical': return featureFlags.categoricalOutlookEnabled;
          default: return false;
        }
      })();

      // Only change if the outlook type is enabled
      if (isEnabled) {
        state.drawingState.activeOutlookType = action.payload;
        // Reset probability when changing outlook type
        if (action.payload === 'tornado') {
          state.drawingState.activeProbability = '2%';
        } else if (action.payload === 'wind' || action.payload === 'hail') {
          state.drawingState.activeProbability = '5%';
        } else {
          state.drawingState.activeProbability = 'MRGL';
        }
        state.isSaved = false;
      } else {
        // If the requested type is disabled, switch to the first available type
        const newType = getFirstEnabledOutlookType(featureFlags);
        state.drawingState.activeOutlookType = newType;
        state.drawingState.activeProbability = getInitialProbability(newType);
      }

      // Check if we're in emergency mode (all outlooks disabled)
      state.emergencyMode = !isAnyOutlookEnabled(featureFlags);
    },

    // Set the active probability/risk level for drawing
    setActiveProbability: (state, action: PayloadAction<"TSTM" | "MRGL" | "SLGT" | "ENH" | "MDT" | "HIGH" | "2%" | "5%" | "10%" | "10#" | "15%" | "15#" | "30%" | "30#" | "45%" | "45#" | "60%" | "60#">) => {
      state.drawingState.activeProbability = action.payload;
      // If probability contains '#', it's significant
      state.drawingState.isSignificant = action.payload.includes('#');
      state.isSaved = false;
    },

    // Toggle significant status
    toggleSignificant: (state) => {
      const currentProb = state.drawingState.activeProbability;
      
      // Only toggle if we're not in categorical mode and the probability supports significant variants
      if (state.drawingState.activeOutlookType !== 'categorical' && 
          !(state.drawingState.activeOutlookType === 'tornado' && ['2%', '5%'].includes(currentProb)) &&
          !((['wind', 'hail'].includes(state.drawingState.activeOutlookType)) && ['5%'].includes(currentProb))) {
        // Toggle the significant state
        state.drawingState.isSignificant = !state.drawingState.isSignificant;
        state.isSaved = false;
      }
    },

    // Add a drawn feature to the appropriate outlook
    addFeature: (state, action: PayloadAction<{ feature: GeoJSON.Feature }>) => {
      const feature = action.payload.feature;
      const outlookType = feature.properties?.outlookType || state.drawingState.activeOutlookType;
      let probability = feature.properties?.probability || state.drawingState.activeProbability;

      // If the feature is significant, add it on top of existing layers
      if (state.drawingState.isSignificant) {
        probability = `${probability.replace('%', '')}#`;
      }

      // Get existing features for this probability or create new array
      const outlookMap = state.outlooks[outlookType as keyof OutlookData];
      const existingFeatures = outlookMap.get(probability) || [];

      // Ensure the feature has all required properties
      const featureWithProps = {
        ...feature,
        properties: {
          ...feature.properties,
          outlookType,
          probability,
          isSignificant: state.drawingState.isSignificant,
          derivedFrom: feature.properties?.derivedFrom || outlookType,
          originalProbability: feature.properties?.originalProbability || probability
        }
      };

      // Add new feature
      outlookMap.set(probability, [...existingFeatures, featureWithProps]);

      state.isSaved = false;
    },
    
    // Remove a feature by ID
    removeFeature: (state, action: PayloadAction<{ 
      outlookType: OutlookType, 
      probability: string, 
      featureId: string 
    }>) => {
      const { outlookType, probability, featureId } = action.payload;
      const features = state.outlooks[outlookType].get(probability);
      
      if (features) {
        const updatedFeatures = features.filter(feature => 
          feature.id !== featureId
        );
        
        if (updatedFeatures.length > 0) {
          state.outlooks[outlookType].set(probability, updatedFeatures);
        } else {
          state.outlooks[outlookType].delete(probability);
        }
        
        state.isSaved = false;
      }
    },
    
    // Reset just the categorical outlooks (used by useAutoCategorical)
    resetCategorical: (state) => {
      // Store TSTM features before resetting
      const tstmFeatures = state.outlooks.categorical.get('TSTM') || [];
      
      // Clear all categorical outlooks
      state.outlooks.categorical = new Map();
      
      // Restore TSTM features if they exist
      if (tstmFeatures.length > 0) {
        state.outlooks.categorical.set('TSTM', tstmFeatures);
      }
      
      state.isSaved = false;
    },

    // Set a specific outlook map (used for preserving TSTM areas)
    setOutlookMap: (state, action: PayloadAction<{ 
      outlookType: OutlookType, 
      map: Map<string, GeoJSON.Feature[]> 
    }>) => {
      const { outlookType, map } = action.payload;
      state.outlooks[outlookType] = map;
      state.isSaved = false;
    },
    
    // Set map view (center and zoom)
    setMapView: (state, action: PayloadAction<{ center: [number, number], zoom: number }>) => {
      state.currentMapView = action.payload;
    },
    
    // Reset all outlook data
    resetForecasts: (state) => {
      state.outlooks = {
        tornado: new Map(),
        wind: new Map(),
        hail: new Map(),
        categorical: new Map()
      };
      state.isSaved = false;
    },
    
    // Mark the forecast as saved
    markAsSaved: (state) => {
      state.isSaved = true;
    },

    // Import forecast data with TSTM preservation
    importForecasts: (state, action: PayloadAction<OutlookData>) => {
      // Store existing TSTM features before importing
      const existingTstm = state.outlooks.categorical.get('TSTM') || [];
      
      // Import new data
      state.outlooks = action.payload;
      
      // Merge existing TSTM features with imported ones
      const importedTstm = state.outlooks.categorical.get('TSTM') || [];
      const mergedTstm = [...existingTstm, ...importedTstm];
      
      if (mergedTstm.length > 0) {
        state.outlooks.categorical.set('TSTM', mergedTstm);
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
  removeFeature,
  resetCategorical,
  setOutlookMap,
  setMapView,
  resetForecasts,
  markAsSaved,
  importForecasts
} = forecastSlice.actions;

export default forecastSlice.reducer;