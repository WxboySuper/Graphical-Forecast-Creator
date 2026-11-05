import type { RootState } from './index';
import { selectCurrentDay, selectDiscussionDraftForScope, selectForecast, selectForecastCycle } from './forecastSlice';
import * as selectors from './forecastSelectors';
import { selectSavedCycles as selectExistingSavedCycles } from './forecastSliceSelectors';

test('preserves the selector exports used by existing forecast slice consumers', () => {
  expect(selectForecast).toBe(selectors.selectForecast);
  expect(selectForecastCycle).toBe(selectors.selectForecastCycle);
  expect(selectCurrentDay).toBe(selectors.selectCurrentDay);
  expect(selectDiscussionDraftForScope).toBe(selectors.selectDiscussionDraftForScope);
});

test('uses the existing saved-cycle fallback for legacy state', () => {
  const legacyState = { forecast: {} } as RootState;
  expect(selectors.selectSavedCycles).toBe(selectExistingSavedCycles);
  expect(selectors.selectSavedCycles(legacyState)).toEqual([]);
});
