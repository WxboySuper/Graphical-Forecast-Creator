import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type AppMode = 'forecast' | 'verification';

interface AppModeState {
  mode: AppMode;
}

const initialState: AppModeState = {
  mode: 'forecast'
};

const appModeSlice = createSlice({
  name: 'appMode',
  initialState,
  reducers: {
    setAppMode: (state, action: PayloadAction<AppMode>) => {
      state.mode = action.payload;
    },
    toggleMode: (state) => {
      state.mode = state.mode === 'forecast' ? 'verification' : 'forecast';
    }
  }
});

export const { setAppMode, toggleMode } = appModeSlice.actions;
export default appModeSlice.reducer;
