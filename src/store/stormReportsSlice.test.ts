import { clearReports } from './stormReportsSlice';
import stormReportsReducer from './stormReportsSlice';
import type { StormReportsState } from '../types/stormReports';

describe('stormReportsReducer', () => {
  test('starts clearGeneration at one for rehydrated state without the field', () => {
    const rehydratedState = {
      reports: [],
      date: null,
      loading: true,
      error: null,
      visible: true,
      filterByType: { tornado: true, wind: true, hail: true }
    } as Partial<StormReportsState> as StormReportsState;

    expect(stormReportsReducer(rehydratedState, clearReports()).clearGeneration).toBe(1);
  });
});
