import { renderHook } from '@testing-library/react';
import type { ForecastCycle } from '../../types/outlooks';
import { trackEvent } from './events';
import { useFirstShapeTelemetry } from './useFirstShapeTelemetry';

jest.mock('./events', () => ({ trackEvent: jest.fn() }));

beforeEach(() => {
  jest.mocked(trackEvent).mockClear();
});

const polygon = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} };
const makeCycle = (features: unknown[] = []): ForecastCycle => ({
  cycleDate: '2026-11-27',
  currentDay: 1,
  days: { 1: { data: { tornado: new Map([['2%', features]]) } } },
} as unknown as ForecastCycle);

test('fires after the first polygon lands and once per cycle generation', () => {
  const { rerender } = renderHook(({ cycle, generation }) => useFirstShapeTelemetry(cycle, generation), {
    initialProps: { cycle: makeCycle(), generation: 1 },
  });
  expect(trackEvent).not.toHaveBeenCalled();

  rerender({ cycle: makeCycle([polygon]), generation: 1 });
  expect(trackEvent).toHaveBeenCalledTimes(1);
  expect(trackEvent).toHaveBeenCalledWith('first_shape_drawn');

  rerender({ cycle: makeCycle([polygon, polygon]), generation: 1 });
  expect(trackEvent).toHaveBeenCalledTimes(1);

  rerender({ cycle: makeCycle([polygon]), generation: 2 });
  expect(trackEvent).toHaveBeenCalledTimes(1);
  rerender({ cycle: makeCycle(), generation: 2 });
  rerender({ cycle: makeCycle([polygon]), generation: 2 });
  expect(trackEvent).toHaveBeenCalledTimes(2);
});

test('does not count non-polygon features', () => {
  const point = { ...polygon, geometry: { type: 'Point', coordinates: [] } };
  const { rerender } = renderHook(({ cycle, generation }) => useFirstShapeTelemetry(cycle, generation), {
    initialProps: { cycle: makeCycle(), generation: 1 },
  });
  rerender({ cycle: makeCycle([point]), generation: 1 });
  expect(trackEvent).not.toHaveBeenCalled();
});
