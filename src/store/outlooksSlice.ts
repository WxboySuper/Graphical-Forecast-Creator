import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Outlook } from '../types/outlook';

export interface OutlooksState {
  outlooks: Outlook[];
}

const initialState: OutlooksState = {
  outlooks: [],
};

export const outlooksSlice = createSlice({
  name: 'outlooks',
  initialState,
  reducers: {
    addOutlook: (state, action: PayloadAction<Outlook>) => {
      state.outlooks.push(action.payload);
    },
  },
});

export const { addOutlook } = outlooksSlice.actions;

export default outlooksSlice.reducer;
