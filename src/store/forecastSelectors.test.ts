import type { DayType } from '../types/outlooks';
import reducer, {
  selectCurrentOutlooks,
  selectOutlooksForDay,
  setForecastDay,
} from './forecastSlice';

const withForecast = (forecastState: ReturnType<typeof reducer>) =>
  ({ forecast: forecastState } as Parameters<typeof selectCurrentOutlooks>[0]);

describe('forecast selector referential stability', () => {
  it('selectCurrentOutlooks returns the same fallback reference for an absent current day', () => {
    const base = reducer(undefined, setForecastDay(1));
    const absentDayState = {
      ...base,
      forecastCycle: { ...base.forecastCycle, currentDay: 5 as DayType },
    };
    const state = withForecast(absentDayState);
    expect(selectCurrentOutlooks(state)).toBe(selectCurrentOutlooks(state));
  });

  it('selectOutlooksForDay returns the same fallback reference for the same day shape', () => {
    const state = withForecast(reducer(undefined, setForecastDay(1)));
    expect(selectOutlooksForDay(state, 2)).toBe(selectOutlooksForDay(state, 2));
    expect(selectOutlooksForDay(state, 3)).toBe(selectOutlooksForDay(state, 3));
    expect(selectOutlooksForDay(state, 4)).toBe(selectOutlooksForDay(state, 4));
  });

  it('selectOutlooksForDay returns a safe fallback for an unknown day', () => {
    const state = withForecast(reducer(undefined, setForecastDay(1)));
    const fallback = selectOutlooksForDay(state, 99 as DayType);

    expect(fallback).toBeDefined();
    expect(fallback['day4-8']).toBeInstanceOf(Map);
    expect(fallback).toBe(selectOutlooksForDay(state, 99 as DayType));
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
    expect(() => day48Map.set('30%', [])).toThrow(/read-only outlook map/);
    expect(() => day48Map.clear()).toThrow(/read-only outlook map/);
  });
});
