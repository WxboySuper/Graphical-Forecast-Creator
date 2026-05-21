import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { MonitorMapView, MonitorOutlookSourceSelection, MonitorSettings } from '../monitor/types';
import { DEFAULT_MONITOR_SETTINGS, normalizeMonitorSettings } from '../monitor/types';

export type MonitorState = MonitorSettings;

const initialState: MonitorState = DEFAULT_MONITOR_SETTINGS;

const monitorSlice = createSlice({
  name: 'monitor',
  initialState,
  reducers: {
    applyMonitorSettings: (_state, action: PayloadAction<Partial<MonitorSettings> | MonitorSettings>) =>
      normalizeMonitorSettings({
        ...DEFAULT_MONITOR_SETTINGS,
        ...action.payload,
      }),
    setRadarMode: (state, action: PayloadAction<MonitorSettings['radarMode']>) => {
      state.radarMode = action.payload;
    },
    setRadarProduct: (state, action: PayloadAction<MonitorSettings['radarProduct']>) => {
      state.radarProduct = action.payload;
      if ((action.payload === 'sr-bref' || action.payload === 'sr-bvel') && state.radarMode === 'mrms-conus') {
        state.radarMode = 'site';
      }
    },
    setRadarSite: (state, action: PayloadAction<string>) => {
      const nextSite = action.payload.trim().toUpperCase();
      if (/^K[A-Z0-9]{3}$/.test(nextSite)) {
        state.radarSite = nextSite;
      }
    },
    setRadarOpacity: (state, action: PayloadAction<number>) => {
      state.radarOpacity = Math.min(1, Math.max(0, action.payload));
    },
    setSatelliteProduct: (state, action: PayloadAction<MonitorSettings['satelliteProduct']>) => {
      state.satelliteProduct = action.payload;
    },
    setSatelliteOpacity: (state, action: PayloadAction<number>) => {
      state.satelliteOpacity = Math.min(1, Math.max(0, action.payload));
    },
    setMonitorOutlookSource: (state, action: PayloadAction<MonitorOutlookSourceSelection>) => {
      state.outlookSource = action.payload;
    },
    setMonitorMapView: (state, action: PayloadAction<MonitorMapView>) => {
      state.mapView = action.payload;
    },
    setAnimationEnabled: (state, action: PayloadAction<boolean>) => {
      state.animationEnabled = action.payload;
    },
    setAnimationSpeedMs: (state, action: PayloadAction<number>) => {
      state.animationSpeedMs = Math.min(3000, Math.max(250, action.payload));
    },
  },
});

export const {
  applyMonitorSettings,
  setRadarMode,
  setRadarProduct,
  setRadarSite,
  setRadarOpacity,
  setSatelliteProduct,
  setSatelliteOpacity,
  setMonitorOutlookSource,
  setMonitorMapView,
  setAnimationEnabled,
  setAnimationSpeedMs,
} = monitorSlice.actions;

export default monitorSlice.reducer;
