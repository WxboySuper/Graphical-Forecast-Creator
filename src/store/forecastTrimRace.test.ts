import type { Feature } from 'geojson';
import reducer, {
  addFeature,
  applyTrimmedCurrentDayOutlooks,
  importForecasts,
} from './forecastSlice';

const feature = (id: string, offset: number): Feature => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[[offset, offset], [offset + 1, offset], [offset + 1, offset + 1], [offset, offset + 1], [offset, offset]]],
  },
  properties: { outlookType: 'tornado', probability: '2%', isSignificant: false },
});

test('ignores trim results from a cycle replaced during async work', () => {
  let state = reducer(undefined, addFeature({ feature: feature('old', 0) }));
  const staleGeneration = state.cycleGeneration;
  const staleData = state.forecastCycle.days[1]!.data;
  state = reducer(state, importForecasts({ tornado: new Map([['2%', [feature('new', 10)]]]) }));
  expect(state.cycleGeneration).toBe(staleGeneration + 1);
  state = reducer(state, applyTrimmedCurrentDayOutlooks({
    day: 1,
    cycleGeneration: staleGeneration,
    cycleDate: state.forecastCycle.cycleDate,
    data: staleData,
    result: { trimmedCount: 1, removedCount: 0, failedCount: 0, skippedCount: 0, errors: [] },
  }));
  expect(state.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0]?.id).toBe('new');
});
