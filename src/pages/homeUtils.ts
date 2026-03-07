import { DayType } from '../types/outlooks';

export function computeHomeStats(forecastCycle: any, savedCyclesLength: number) {
  const daysWithData: DayType[] = [];
  let totalOutlooks = 0;
  let totalFeatures = 0;

  Object.entries(forecastCycle.days as Record<string, any>).forEach(([dayStr, dayData]) => {
    const day = parseInt(dayStr) as DayType;
    let dayHasData = false;
    const dd = dayData as any;

    if (dd.metadata?.lowProbabilityOutlooks && dd.metadata.lowProbabilityOutlooks.length > 0) {
      dayHasData = true;
    }

    Object.values(dd.data || {}).forEach((outlookMap: any) => {
      if (outlookMap instanceof Map && outlookMap.size > 0) {
        dayHasData = true;
        totalOutlooks++;
        outlookMap.forEach((features: any[]) => {
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
