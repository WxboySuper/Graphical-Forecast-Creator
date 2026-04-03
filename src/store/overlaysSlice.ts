import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { OutlookType } from '../types/outlooks';

export type BaseMapStyle = 'osm' | 'carto-light' | 'carto-dark' | 'esri-satellite' | 'blank';

export interface OverlaysState {
  stateBorders: boolean;
  counties: boolean;
  baseMapStyle: BaseMapStyle;
  ghostOutlooks: Record<OutlookType, boolean>;
}

const initialState: OverlaysState = {
  stateBorders: true, // Default to showing state borders
  counties: false,
  baseMapStyle: 'osm',
  ghostOutlooks: {
    tornado: false,
    wind: false,
    hail: false,
    categorical: false,
    totalSevere: false,
    'day4-8': false,
  },
};

/** True when two ghost-outlook visibility maps contain the same values. */
const areGhostOutlooksEqual = (
  left: Record<OutlookType, boolean>,
  right: Record<OutlookType, boolean>
): boolean =>
  (Object.keys(left) as OutlookType[]).every((key) => left[key] === right[key]);

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
    toggleGhostOutlook: (state, action: PayloadAction<OutlookType>) => {
      const outlookType = action.payload;
      state.ghostOutlooks[outlookType] = !state.ghostOutlooks[outlookType];
    },
    setGhostOutlookVisibility: (state, action: PayloadAction<{ outlookType: OutlookType; visible: boolean }>) => {
      const { outlookType, visible } = action.payload;
      state.ghostOutlooks[outlookType] = visible;
    },
    applyOverlaySettings: (state, action: PayloadAction<Partial<OverlaysState>>) => {
      const { stateBorders, counties, baseMapStyle, ghostOutlooks } = action.payload;

      if (typeof stateBorders === 'boolean') {
        state.stateBorders = stateBorders;
      }

      if (typeof counties === 'boolean') {
        state.counties = counties;
      }

      if (baseMapStyle) {
        state.baseMapStyle = baseMapStyle;
      }

      if (ghostOutlooks && !areGhostOutlooksEqual(state.ghostOutlooks, {
        ...state.ghostOutlooks,
        ...ghostOutlooks,
      })) {
        state.ghostOutlooks = {
          ...state.ghostOutlooks,
          ...ghostOutlooks,
        };
      }
    },
    resetOverlays: () => initialState,
  },
});

export const {
  toggleStateBorders,
  toggleCounties,
  setOverlay,
  setBaseMapStyle,
  toggleGhostOutlook,
  setGhostOutlookVisibility,
  applyOverlaySettings,
  resetOverlays,
} = overlaysSlice.actions;

export default overlaysSlice.reducer;
