import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Polygon } from 'geojson';

export interface MesoscaleArea {
  id: string;
  title: string;
  hazard: string;
  confidence?: number;
  validStart: string;
  validEnd: string;
  geometry: Polygon;
  createdAt: string;
  updatedAt: string;
}

export interface MesoscaleModelContext {
  modelId: string | null;
  cycle: string | null;
  forecastHour: number | null;
  activeLayers: Array<{ id: string; opacity: number }>;
}

export interface MesoscaleState {
  areas: MesoscaleArea[];
  discussion: string;
  modelContext: MesoscaleModelContext;
}

export const createInitialMesoscaleState = (): MesoscaleState => ({
  areas: [],
  discussion: '',
  modelContext: { modelId: null, cycle: null, forecastHour: null, activeLayers: [] },
});

const mesoscaleSlice = createSlice({
  name: 'mesoscale',
  initialState: createInitialMesoscaleState(),
  reducers: {
    addMesoscaleArea(state, action: PayloadAction<MesoscaleArea>) {
      if (state.areas.some((area) => area.id === action.payload.id)) return;
      state.areas.push(action.payload);
    },
    updateMesoscaleArea(state, action: PayloadAction<MesoscaleArea>) {
      const index = state.areas.findIndex((area) => area.id === action.payload.id);
      if (index >= 0) state.areas[index] = action.payload;
    },
    removeMesoscaleArea(state, action: PayloadAction<string>) {
      state.areas = state.areas.filter((area) => area.id !== action.payload);
    },
    setMesoscaleDiscussion(state, action: PayloadAction<string>) {
      state.discussion = action.payload;
    },
    setMesoscaleModelContext(state, action: PayloadAction<MesoscaleModelContext>) {
      state.modelContext = action.payload;
    },
    replaceMesoscaleProduct(_state, action: PayloadAction<MesoscaleState>) {
      return action.payload;
    },
    resetMesoscaleProduct() {
      return createInitialMesoscaleState();
    },
  },
});

export const {
  addMesoscaleArea, updateMesoscaleArea, removeMesoscaleArea,
  setMesoscaleDiscussion, setMesoscaleModelContext,
  replaceMesoscaleProduct, resetMesoscaleProduct,
} = mesoscaleSlice.actions;
export const selectMesoscaleState = (state: { mesoscale: MesoscaleState }): MesoscaleState => state.mesoscale;
export const selectMesoscaleAreas = (state: { mesoscale: MesoscaleState }): MesoscaleArea[] => state.mesoscale.areas;
export default mesoscaleSlice.reducer;
