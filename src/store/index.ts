// Import the immerSetup first to ensure MapSet is enabled before configureStore is used
import { immerConfigured } from '../immerSetup';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer from './forecastSlice';

// Log that Immer has been configured with MapSet
console.log('Immer configured with MapSet:', immerConfigured);

export const store = configureStore({
  reducer: {
    forecast: forecastReducer,
  },
  // Configure to handle Maps in Redux state - this allows for serialization of Map objects
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore Map objects in state
        ignoredPaths: ['forecast.outlooks'],
        ignoredActions: ['forecast/addFeature', 'forecast/removeFeature', 'forecast/importForecasts'],
      },
      // Add immutableCheck option to help with debugging
      immutableCheck: { warnAfter: 128 },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;