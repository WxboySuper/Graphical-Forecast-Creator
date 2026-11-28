import { useEffect, useRef } from 'react';
import type { ForecastCycle } from '../../types/outlooks';
import { trackEvent } from './events';

const countOutlookShapes = (cycle: ForecastCycle): number => Object.values(cycle.days)
  .flatMap((day) => Object.values(day.data))
  .flatMap((outlook) => outlook ? [...outlook.values()].flat() : [])
  .filter((feature) => feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon')
  .length;

/** Tracks the first saved outlook polygon after each whole-cycle transition. */
export const useFirstShapeTelemetry = (cycle: ForecastCycle, cycleGeneration: number): void => {
  const shapeCount = countOutlookShapes(cycle);
  const tracking = useRef({ cycleGeneration, shapeCount, fired: false });

  useEffect(() => {
    const current = tracking.current;
    if (current.cycleGeneration !== cycleGeneration) {
      tracking.current = { cycleGeneration, shapeCount, fired: false };
      return;
    }

    if (current.shapeCount !== 0) {
      current.shapeCount = shapeCount;
      return;
    }
    if (shapeCount === 0) return;
    current.shapeCount = shapeCount;
    if (current.fired) return;

    current.fired = true;
    trackEvent('first_shape_drawn');
  }, [cycleGeneration, shapeCount]);
};
