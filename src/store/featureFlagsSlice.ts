import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Define the feature flags interface
export interface FeatureFlags {
  // Drawing features
  exportMapEnabled: boolean;
  
  // Outlook type availability
  tornadoOutlookEnabled: boolean;
  windOutlookEnabled: boolean;
  hailOutlookEnabled: boolean;
  categoricalOutlookEnabled: boolean;
  
  // Other features
  saveLoadEnabled: boolean;
  significantThreatsEnabled: boolean;
}

const initialState: FeatureFlags = {
  exportMapEnabled: false, // Disabled due to Leaflet coordinate system limitations - see issue #32 for future work (server-side rendering or library migration)
  tornadoOutlookEnabled: true,
  windOutlookEnabled: true,
  hailOutlookEnabled: true,
  categoricalOutlookEnabled: true,
  saveLoadEnabled: true,
  significantThreatsEnabled: true,
};

export const featureFlagsSlice = createSlice({
  name: 'featureFlags',
  initialState,
  reducers: {
    // Set a specific feature flag
    setFeatureFlag: (
      state,
      action: PayloadAction<{ feature: keyof FeatureFlags; enabled: boolean }>
    ) => {
      const { feature, enabled } = action.payload;
      state[feature] = enabled;
    },
    
    // Update multiple feature flags at once
    updateFeatureFlags: (
      state,
      action: PayloadAction<Partial<FeatureFlags>>
    ) => {
      return { ...state, ...action.payload };
    },
    
    // Reset all feature flags to default values
    resetFeatureFlags: () => {
      return initialState;
    }
  },
});

export const { 
  setFeatureFlag, 
  updateFeatureFlags,
  resetFeatureFlags 
} = featureFlagsSlice.actions;

export default featureFlagsSlice.reducer;