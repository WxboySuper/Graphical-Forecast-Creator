import '../immerSetup';
import { configureStore } from '@reduxjs/toolkit';
import { createSentryReduxEnhancer } from './sentryEnhancer';
import { createTimestampMiddleware } from './timestampMiddleware';
import forecastReducer from './forecastSlice';
import overlaysReducer from './overlaysSlice';
import stormReportsReducer from './stormReportsSlice';
import appModeReducer from './appModeSlice';
import themeReducer from './themeSlice';
import verificationReducer from './verificationSlice';
import monitorReducer from './monitorSlice';
import {
  SERIALIZABLE_IGNORED_ACTIONS,
  SERIALIZABLE_IGNORED_PATHS,
} from './serializableCheckConfig';

export const store = configureStore({
  reducer: {
    forecast: forecastReducer,
    overlays: overlaysReducer,
    stormReports: stormReportsReducer,
    appMode: appModeReducer,
    theme: themeReducer,
    verification: verificationReducer,
    monitor: monitorReducer,
  },
  enhancers: (getDefaultEnhancers) => {
    const defaults = getDefaultEnhancers();
    const sentryEnhancer = createSentryReduxEnhancer();
    return sentryEnhancer ? defaults.concat(sentryEnhancer) : defaults;
  },
  // Configure to handle Maps in Redux state - this allows for serialization of Map objects
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Map-carrying state paths and action payloads live in one shared
        // module so the ignore list cannot drift from the reducers silently.
        ignoredPaths: SERIALIZABLE_IGNORED_PATHS,
        ignoredActions: SERIALIZABLE_IGNORED_ACTIONS,
      },
    }).concat(createTimestampMiddleware() as never),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

