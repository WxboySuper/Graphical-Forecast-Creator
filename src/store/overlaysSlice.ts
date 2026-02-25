import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type BaseMapStyle = 'osm' | 'carto-light' | 'carto-dark' | 'esri-satellite' | 'blank';

export interface OverlaysState {
  stateBorders: boolean;
  counties: boolean;
  baseMapStyle: BaseMapStyle;
}

const initialState: OverlaysState = {
  stateBorders: true, // Default to showing state borders
  counties: false,
  baseMapStyle: 'osm',
};

const overlaysSlice = createSlice({
  name: 'overlays',
  initialState,
  reducers: {
    toggleStateBorders: (state) => {
      state.stateBorders = !state.stateBorders;
    },
    toggleCounties: (state) => {
      state.counties = !state.counties;
    },
    setOverlay: (state, action: PayloadAction<{ layer: 'stateBorders' | 'counties'; visible: boolean }>) => {
      state[action.payload.layer] = action.payload.visible;
    },
    setBaseMapStyle: (state, action: PayloadAction<BaseMapStyle>) => {
      state.baseMapStyle = action.payload;
    },
    resetOverlays: () => initialState,
  },
});

export const {
  toggleStateBorders,
  toggleCounties,
  setOverlay,
  setBaseMapStyle,
  resetOverlays,
} = overlaysSlice.actions;

export default overlaysSlice.reducer;
