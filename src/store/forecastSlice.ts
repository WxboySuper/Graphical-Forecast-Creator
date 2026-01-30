import '../immerSetup';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OutlookData, OutlookType, DrawingState } from '../types/outlooks';
import { GeoJSON } from 'leaflet';

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

const initialState: ForecastState = {
  outlooks: {
    tornado: new Map(),
    wind: new Map(),
    hail: new Map(),
    categorical: new Map()
  },
  drawingState: {
    // Start with wind as default since it's enabled in feature flags
    activeOutlookType: 'tornado',
    activeProbability: '5%',
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

  // If the current outlook type is categorical, return categorical labels unchanged
  if (state.drawingState.activeOutlookType === 'categorical') {
    return base;
  }

  // Otherwise treat as numeric probability: strip any existing '%' or '#' and append correct suffix
  const normalized = String(base).replace(/[%#]/g, '');
  return state.drawingState.isSignificant ? `${normalized}#` : `${normalized}%`;
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

export const forecastSlice = createSlice({
  name: 'forecast',
  initialState,
  reducers: {
    // Set the active outlook type for drawing (tornado, wind, hail, categorical)
    setActiveOutlookType: (state, action: PayloadAction<OutlookType>) => {
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
      },

      // Update emergency mode status
      setEmergencyMode: (state, action: PayloadAction<boolean>) => {
        state.emergencyMode = action.payload;
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

      // Break complex conditional into clear boolean checks
      const activeType = state.drawingState.activeOutlookType;
      const isCategorical = activeType === 'categorical';
      const unsupportedForTornado = activeType === 'tornado' && (currentProb === '2%' || currentProb === '5%');
      const unsupportedForWindHail = (activeType === 'wind' || activeType === 'hail') && currentProb === '5%';

      // Only allow toggling when not categorical and not one of the unsupported combinations
      const canToggle = !isCategorical && !unsupportedForTornado && !unsupportedForWindHail;

      if (canToggle) {
        state.drawingState.isSignificant = !state.drawingState.isSignificant;
        state.isSaved = false;
      }
    },

    // Add a drawn feature to the appropriate outlook
    addFeature: (state, action: PayloadAction<{ feature: GeoJSON.Feature }>) => {
      const feature = action.payload.feature;
      const outlookType = computeOutlookType(feature, state);
      const probability = computeProbability(feature, state);

      const outlookMap = state.outlooks[outlookType as keyof OutlookData];
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
    
    // Update an existing feature (e.g. after geometry edit)
    updateFeature: (state, action: PayloadAction<{ feature: GeoJSON.Feature }>) => {
      const feature = action.payload.feature;
      // We assume the feature properties are preserved from the original
      const outlookType = (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;
      const probability = (feature.properties?.probability as string) || state.drawingState.activeProbability;
      
      const outlookMap = state.outlooks[outlookType];
      // Normalize probability key access just in case
      // (The map keys are strings like "5%", "TSTM")
      // If the feature came from the store, it should have the correct probability in properties.
      
      const features = outlookMap.get(probability);
      
      if (features) {
        const index = features.findIndex(f => f.id === feature.id);
        if (index !== -1) {
          // Update the feature while preserving properties that might not be in the payload if strictly geometry
          // But usually we pass the whole feature back.
          features[index] = {
            ...features[index],
            geometry: feature.geometry,
            // Update properties if they changed, but ensure core tracking props stay
            properties: {
              ...features[index].properties,
              ...feature.properties
            }
          };
          state.isSaved = false;
        }
      }
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
  updateFeature,
  removeFeature,
  resetCategorical,
  setOutlookMap,
  setMapView,
  resetForecasts,
  markAsSaved,
  importForecasts,
  setEmergencyMode
} = forecastSlice.actions;

export default forecastSlice.reducer;