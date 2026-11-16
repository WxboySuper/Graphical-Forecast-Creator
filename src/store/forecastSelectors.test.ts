/**
 * Forecast selector tests. Verify derived forecast state remains consistent with stored edits and active layers.
 */
import type { DayType } from '../types/outlooks';
import type { RootState } from './index';
import reducer, {
  selectCurrentDay,
  selectCurrentOutlooks,
  selectDiscussionDraftForScope,
  selectForecast,
  selectForecastCycle,
  selectOutlooksForDay,
  setForecastDay,
} from './forecastSlice';
import { getFallbackOutlookData } from './forecastStateFactory';
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

describe('selector referential stability', () => {
  const withForecast = (forecastState: ReturnType<typeof reducer>) => ({ forecast: forecastState } as Parameters<typeof selectCurrentOutlooks>[0]);

  it('selectCurrentOutlooks returns the same fallback reference for an absent current day', () => {
    // Point currentDay at a day that has no entry so the selector must fall
    // back to the shared empty reference rather than real day data.
    const base = reducer(undefined, setForecastDay(1));
    const absentDayState = {
      ...base,
      forecastCycle: { ...base.forecastCycle, currentDay: 5 as DayType },
    };
    const state = withForecast(absentDayState);
    const first = selectCurrentOutlooks(state);
    const second = selectCurrentOutlooks(state);
    expect(first).toBe(second);
  });

  it('keeps fallback selectors referentially stable for all supported day shapes', () => {
    const state = withForecast(reducer(undefined, setForecastDay(1)));
    expect(selectOutlooksForDay(state, 2)).toBe(selectOutlooksForDay(state, 2));
    expect(selectOutlooksForDay(state, 3)).toBe(selectOutlooksForDay(state, 3));
    expect(selectOutlooksForDay(state, 4)).toBe(selectOutlooksForDay(state, 4));

    const base = reducer(undefined, setForecastDay(1));
    const unknownDayState = withForecast(base);
    const fallback = selectOutlooksForDay(unknownDayState, 99 as DayType);

    expect(fallback).toBeDefined();
    expect(fallback['day4-8']).toBeInstanceOf(Map);
    expect(fallback).toBe(selectOutlooksForDay(unknownDayState, 99 as DayType));
  });

  it('selectCurrentOutlooks returns a safe fallback for an unknown current day', () => {
    const base = reducer(undefined, setForecastDay(1));
    const state = withForecast({
      ...base,
      forecastCycle: { ...base.forecastCycle, currentDay: 99 as DayType },
    });
    const fallback = selectCurrentOutlooks(state);

    expect(fallback).toBeDefined();
    expect(fallback['day4-8']).toBeInstanceOf(Map);
    expect(fallback).toBe(selectCurrentOutlooks(state));
  });

  it('does not expose the shared fallback as the current day data for a real day', () => {
    const forecastState = reducer(undefined, setForecastDay(1));
    const real = forecastState.forecastCycle.days[1]?.data;
    expect(real).toBeDefined();
    expect(selectCurrentOutlooks(withForecast(forecastState))).toBe(real);
  });

  it('throws when a consumer tries to mutate the shared fallback map', () => {
    const base = reducer(undefined, setForecastDay(1));
    const absentDayState = {
      ...base,
      forecastCycle: { ...base.forecastCycle, currentDay: 5 as DayType },
    };
    const fallback = selectCurrentOutlooks(withForecast(absentDayState));
    const day48Map = fallback['day4-8']!;
    expect(day48Map).toBeInstanceOf(Map);
    expect(day48Map.size).toBe(0);
    expect(day48Map.get('30%')).toBeUndefined();
    expect([...day48Map.entries()]).toEqual([]);
    expect(getFallbackOutlookData()['day4-8']!.size).toBe(0);
    expect(getFallbackOutlookData()['day4-8']!.get('30%')).toBeUndefined();
    expect(() => day48Map.forEach(() => {})).not.toThrow();
    expect(() => day48Map.set('30%', [])).toThrow(/read-only outlook map/);
    expect(() => day48Map.clear()).toThrow(/read-only outlook map/);
  });
});