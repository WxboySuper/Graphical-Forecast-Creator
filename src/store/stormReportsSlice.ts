import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { StormReport, StormReportsState, ReportType } from '../types/stormReports';

const initialState: StormReportsState = {
  reports: [],
  date: null,
  loading: false,
  clearGeneration: 0,
  error: null,
  visible: true,
  filterByType: {
    tornado: true,
    wind: true,
    hail: true
  }
};

const stormReportsSlice = createSlice({
  name: 'stormReports',
  initialState,
  reducers: {
    setReports: (state, action: PayloadAction<StormReport[]>) => {
      state.reports = action.payload;
      state.error = null;
    },
    setDate: (state, action: PayloadAction<string>) => {
      state.date = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },
    toggleVisibility: (state) => {
      state.visible = !state.visible;
    },
    setVisibility: (state, action: PayloadAction<boolean>) => {
      state.visible = action.payload;
    },
    toggleReportType: (state, action: PayloadAction<ReportType>) => {
      state.filterByType[action.payload] = !state.filterByType[action.payload];
    },
    clearReports: (state) => {
      state.reports = [];
      state.date = null;
      state.loading = false;
      state.clearGeneration += 1;
      state.error = null;
    }
  }
});

export const {
  setReports,
  setDate,
  setLoading,
  setError,
  toggleVisibility,
  setVisibility,
  toggleReportType,
  clearReports
} = stormReportsSlice.actions;

export default stormReportsSlice.reducer;
