import type { Feature } from 'geojson';
import type { ForecastCycle, OutlookDay, DayType } from '../types/outlooks';

/** Aggregates outlook statistics from a forecast cycle for dashboard display. */
export function computeHomeStats(forecastCycle: ForecastCycle, savedCyclesLength: number) {
  const daysWithData: DayType[] = [];
  let totalOutlooks = 0;
  let totalFeatures = 0;

  (Object.entries(forecastCycle.days) as [string, OutlookDay | undefined][]).forEach(([dayStr, dayData]) => {
    const day = parseInt(dayStr) as DayType;
    let dayHasData = false;

    if (!dayData) return;

    if (dayData.metadata?.lowProbabilityOutlooks && dayData.metadata.lowProbabilityOutlooks.length > 0) {
      dayHasData = true;
    }

    (Object.values(dayData.data) as (Map<string, Feature[]> | undefined)[]).forEach((outlookMap) => {
      if (outlookMap instanceof Map && outlookMap.size > 0) {
        dayHasData = true;
        totalOutlooks++;
        outlookMap.forEach((features: Feature[]) => {
          totalFeatures += features.length;
        });
      }
    });

    if (dayHasData) {
      daysWithData.push(day);
    }
  });

  return {
    daysWithData,
    totalOutlooks,
    totalFeatures,
    savedCyclesCount: savedCyclesLength,
  };
}

/** Formats an ISO date string (YYYY-MM-DD) into a human-readable weekday and date string. */
export function formatCycleDate(cycleDate: string) {
  const [year, month, day] = cycleDate.split('-').map(Number);
  const localDate = new Date(year, month - 1, day);
  return localDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
