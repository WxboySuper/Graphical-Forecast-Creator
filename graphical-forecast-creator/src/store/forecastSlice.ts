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
}

const initialState: ForecastState = {
  outlooks: {
    tornado: new Map(),
    wind: new Map(),
    hail: new Map(),
    categorical: new Map()
  },
  drawingState: {
    activeOutlookType: 'tornado',
    activeProbability: '2%',
    isSignificant: false
  },
  currentMapView: {
    center: [39.8283, -98.5795], // Geographic center of the contiguous United States
    zoom: 4
  },
  isSaved: true
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
      // Only applicable to probabilities that support significant variants
      if (
        state.drawingState.activeOutlookType !== 'categorical' &&
        !['2%', '5%'].includes(currentProb as string)
      ) {
        state.drawingState.isSignificant = !state.drawingState.isSignificant;
        state.isSaved = false;
      }
    },

    // Add a drawn feature to the appropriate outlook
    addFeature: (state, action: PayloadAction<{ feature: GeoJSON.Feature }>) => {
      const { activeOutlookType, activeProbability, isSignificant } = state.drawingState;
      
      // Create formatted probability string with # for significant threats
      let probKey = activeProbability;
      if (isSignificant && activeOutlookType !== 'categorical') {
        if (!probKey.includes('#')) {
          probKey = `${probKey.replace('%', '')}#` as any;
        }
      }
      
      // Get existing features for this probability or create new array
      const outlookMap = state.outlooks[activeOutlookType];
      const existingFeatures = outlookMap.get(probKey) || [];
      
      // Add new feature
      outlookMap.set(probKey, [...existingFeatures, action.payload.feature]);
      
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
      state.outlooks.categorical = new Map();
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

    // Import forecast data
    importForecasts: (state, action: PayloadAction<OutlookData>) => {
      state.outlooks = action.payload;
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
  setMapView,
  resetForecasts,
  markAsSaved,
  importForecasts
} = forecastSlice.actions;

export default forecastSlice.reducer;