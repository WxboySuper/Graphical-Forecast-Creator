import type { Feature } from 'geojson';
import type { ForecastCycle, OutlookDay, DayType } from '../types/outlooks';
import type { SavedCycle } from '../store/forecastSlice';

/** Counts how many forecast days inside a cycle actually contain outlook data. */
const countForecastDays = (forecastCycle: ForecastCycle): number => {
  let totalForecastDays = 0;

  (Object.values(forecastCycle.days) as (OutlookDay | undefined)[]).forEach((dayData) => {
    let dayHasData = false;

    if (!dayData) {
      return;
    }

    if (dayData.metadata?.lowProbabilityOutlooks && dayData.metadata.lowProbabilityOutlooks.length > 0) {
      dayHasData = true;
    }

    (Object.values(dayData.data) as (Map<string, Feature[]> | undefined)[]).forEach((outlookMap) => {
      if (outlookMap instanceof Map && outlookMap.size > 0) {
        dayHasData = true;
      }
    });

    if (dayHasData) {
      totalForecastDays += 1;
    }
  });

  return totalForecastDays;
};

/** Calculates a local streak of consecutive saved cycle dates, ending on the newest saved date. */
const computeSavedCycleStreak = (savedCycles: SavedCycle[]): number => {
  if (savedCycles.length === 0) {
    return 0;
  }

  const uniqueDates = Array.from(new Set(savedCycles.map((cycle) => cycle.cycleDate))).sort(
    (left, right) => new Date(right).getTime() - new Date(left).getTime()
  );

  let streak = 1;

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(uniqueDates[index - 1]);
    const current = new Date(uniqueDates[index]);
    const diffInDays = Math.round((previous.getTime() - current.getTime()) / 86400000);

    if (diffInDays !== 1) {
      break;
    }

    streak += 1;
  }

  return streak;
};

/** Aggregates outlook statistics from a forecast cycle for dashboard display. */
export function computeHomeStats(forecastCycle: ForecastCycle, savedCycles: SavedCycle[]) {
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
    savedCyclesCount: savedCycles.length,
    totalForecastsMade: savedCycles.reduce(
      (runningTotal, cycle) => runningTotal + countForecastDays(cycle.forecastCycle),
      countForecastDays(forecastCycle)
    ),
    totalCyclesMade: savedCycles.length,
    forecastStreak: computeSavedCycleStreak(savedCycles),
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
