import '../immerSetup';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer from './forecastSlice';
import featureFlagsReducer from './featureFlagsSlice';
import overlaysReducer from './overlaysSlice';
import stormReportsReducer from './stormReportsSlice';
import appModeReducer from './appModeSlice';
import themeReducer from './themeSlice';
import verificationReducer from './verificationSlice';

export const store = configureStore({
  reducer: {
    forecast: forecastReducer,
    featureFlags: featureFlagsReducer,
    overlays: overlaysReducer,
    stormReports: stormReportsReducer,
    appMode: appModeReducer,
    theme: themeReducer,
    verification: verificationReducer,
  },
  // Configure to handle Maps in Redux state - this allows for serialization of Map objects
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore Map objects in state (used for outlook data structures)
        // Use regex to match all days and outlook types
        ignoredPaths: [
          /^forecast\.forecastCycle\.days\.\d+\.data\.(categorical|tornado|wind|hail|totalSevere|day4-8)$/,
          /^verification\.loadedForecast\.days\.\d+\.data\.(categorical|tornado|wind|hail|totalSevere|day4-8)$/,
          'forecast.outlooks',
        ],
        ignoredActions: [
          'forecast/addFeature',
          'forecast/removeFeature',
          'forecast/importForecasts',
          'forecast/importForecastCycle',
          'forecast/setOutlookMap',
          'forecast/resetCategorical',
          'verification/loadVerificationForecast',
        ],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;