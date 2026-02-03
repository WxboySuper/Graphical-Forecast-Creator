import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface OverlaysState {
  stateBorders: boolean;
  counties: boolean;
}

const initialState: OverlaysState = {
  stateBorders: true, // Default to showing state borders
  counties: false,
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
    setOverlay: (state, action: PayloadAction<{ layer: keyof OverlaysState; visible: boolean }>) => {
      state[action.payload.layer] = action.payload.visible;
    },
    resetOverlays: () => initialState,
  },
});

export const {
  toggleStateBorders,
  toggleCounties,
  setOverlay,
  resetOverlays,
} = overlaysSlice.actions;

export default overlaysSlice.reducer;
