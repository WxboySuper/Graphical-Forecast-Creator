import { configureStore } from '@reduxjs/toolkit';
import forecastReducer from './forecastSlice';

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
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;