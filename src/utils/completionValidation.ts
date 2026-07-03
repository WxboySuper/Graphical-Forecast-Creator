import type {
  StandardGrouping,
  ValidationOutlookType,
  ValidationIssue,
  CycleValidationResult,
} from '../types/workflow';
import type { ForecastCycle, DayType, OutlookType, OutlookDay, DiscussionData } from '../types/outlooks';

// ---------------------------------------------------------------------------
// Expected outlook types per day grouping
// ---------------------------------------------------------------------------

const DAY12_OUTLOOKS: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical'];
const DAY3_OUTLOOKS: OutlookType[] = ['totalSevere', 'categorical'];
const DAY48_OUTLOOKS: OutlookType[] = ['day4-8'];

const DEFAULT_GROUPINGS: StandardGrouping[] = ['day1', 'day2', 'day3', 'day4-8'];

const GROUPING_DAY_NUMBERS: Record<StandardGrouping, DayType[]> = {
  day1: [1],
  day2: [2],
  day3: [3],
  'day4-8': [4, 5, 6, 7, 8],
};

const GUIDED_DISCUSSION_FIELDS = [
  'synopsis',
  'meteorologicalSetup',
  'severeWeatherExpectations',
  'timing',
  'regionalBreakdown',
  'additionalConsiderations',
] as const;

interface DayValidationContext {
  day: DayType;
  grouping: StandardGrouping;
  expectedTypes: OutlookType[];
  issues: ValidationIssue[];
  missingGroupings: Set<StandardGrouping>;
  dayData?: OutlookDay;
}

interface ValidationAccumulator {
  issues: ValidationIssue[];
  missingGroupings: Set<StandardGrouping>;
}

/** Maps forecast day numbers to their grouping key. */
const dayToGrouping = (day: DayType): StandardGrouping => {
  if (day === 1) return 'day1';
  if (day === 2) return 'day2';
  if (day === 3) return 'day3';
  return 'day4-8';
};

/** Returns the expected outlook types for a given day number. */
const expectedOutlookTypesForDay = (day: DayType): OutlookType[] => {
  if (day === 1 || day === 2) return DAY12_OUTLOOKS;
  if (day === 3) return DAY3_OUTLOOKS;
  return DAY48_OUTLOOKS;
};

/** Returns true when an outlook map has at least one non-TSTM polygon drawn. */
const hasPolygonData = (map: Map<string, unknown[]> | undefined): boolean => {
  if (!map) return false;
  for (const [key, features] of map.entries()) {
    if (key !== 'TSTM' && features.length > 0) return true;
  }
  return false;
};

/** Returns true when the categorical map has non-TSTM data or risk levels above TSTM. */
const hasCategoricalData = (map: Map<string, unknown[]> | undefined): boolean => {
  if (!map) return false;
  for (const [key, features] of map.entries()) {
    if (key !== 'TSTM' && features.length > 0) return true;
  }
  return false;
};

const hasOutlookData = (
  outlookType: OutlookType,
  map: Map<string, unknown[]> | undefined,
): boolean => (
  outlookType === 'categorical'
    ? hasCategoricalData(map)
    : hasPolygonData(map)
);

const hasGuidedDiscussionContent = (
  guided: NonNullable<DiscussionData['guidedContent']>,
): boolean => GUIDED_DISCUSSION_FIELDS.some(
  (field) => (guided[field]?.trim().length ?? 0) > 0,
);

/** Returns true when a discussion exists and has non-empty content. */
export const hasDiscussionContent = (discussion: DiscussionData | undefined): boolean => {
  if (!discussion) return false;
  if (discussion.mode === 'diy') {
    return (discussion.diyContent?.trim().length ?? 0) > 0;
  }

  const guided = discussion.guidedContent;
  return Boolean(guided && hasGuidedDiscussionContent(guided));
};

const collectDaysToValidate = (expectedGroupings?: StandardGrouping[]): DayType[] => {
  const groupings = expectedGroupings ?? DEFAULT_GROUPINGS;
  return groupings.flatMap((grouping) => GROUPING_DAY_NUMBERS[grouping]);
};

const createDayContext = (
  day: DayType,
  forecastCycle: ForecastCycle,
  accumulator: ValidationAccumulator,
): DayValidationContext => ({
  day,
  grouping: dayToGrouping(day),
  expectedTypes: expectedOutlookTypesForDay(day),
  issues: accumulator.issues,
  missingGroupings: accumulator.missingGroupings,
  dayData: forecastCycle.days[day],
});

const addMissingDayIssues = (ctx: DayValidationContext): void => {
  for (const outlookType of ctx.expectedTypes) {
    ctx.issues.push({
      day: ctx.grouping,
      outlookType: outlookType as ValidationOutlookType,
      type: 'missing-polygon',
      message: `Day ${ctx.day} ${outlookType} outlook: no data drawn`,
      severity: 'critical',
      canNavigate: true,
    });
  }
  ctx.missingGroupings.add(ctx.grouping);
};

const validateOutlookPolygons = (ctx: DayValidationContext): void => {
  const dayData = ctx.dayData;
  if (!dayData) {
    return;
  }

  const lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks || [];

  for (const outlookType of ctx.expectedTypes) {
    if (lowProbabilityOutlooks.includes(outlookType)) {
      continue;
    }

    const outlookMap = dayData.data[outlookType as keyof typeof dayData.data];
    if (hasOutlookData(outlookType, outlookMap as Map<string, unknown[]> | undefined)) {
      continue;
    }

    ctx.issues.push({
      day: ctx.grouping,
      outlookType: outlookType as ValidationOutlookType,
      type: 'missing-polygon',
      message: `Day ${ctx.day} ${outlookType} outlook: no polygon drawn`,
      severity: 'critical',
      canNavigate: true,
    });
    ctx.missingGroupings.add(ctx.grouping);
  }
};

const shouldReportNoTstmForecast = (ctx: DayValidationContext): boolean => {
  const dayData = ctx.dayData;
  if (!dayData) {
    return false;
  }

  const lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks || [];
  const categoricalMap = dayData.data.categorical;

  if (!ctx.expectedTypes.includes('categorical')) {
    return false;
  }

  if (lowProbabilityOutlooks.includes('categorical')) {
    return false;
  }

  if (!categoricalMap || categoricalMap.size === 0) {
    return false;
  }

  return !hasCategoricalData(categoricalMap);
};

const validateNoTstmForecast = (ctx: DayValidationContext): void => {
  if (!shouldReportNoTstmForecast(ctx)) {
    return;
  }

  ctx.issues.push({
    day: ctx.grouping,
    outlookType: 'categorical',
    type: 'no-tstm-forecast',
    message: `Day ${ctx.day} categorical: no TSTM forecast (no polygons drawn)`,
    severity: 'warning',
    canNavigate: false,
  });
};

const dayHasDrawnPolygons = (ctx: DayValidationContext): boolean => {
  const dayData = ctx.dayData;
  if (!dayData) {
    return false;
  }

  const lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks || [];

  return ctx.expectedTypes.some((outlookType) => {
    if (lowProbabilityOutlooks.includes(outlookType)) {
      return false;
    }

    const map = dayData.data[outlookType as keyof typeof dayData.data];
    return hasOutlookData(outlookType, map as Map<string, unknown[]> | undefined);
  });
};

const validateDiscussion = (ctx: DayValidationContext): void => {
  const dayData = ctx.dayData;
  if (!dayData || !dayHasDrawnPolygons(ctx) || hasDiscussionContent(dayData.discussion)) {
    return;
  }

  ctx.issues.push({
    day: ctx.grouping,
    outlookType: 'categorical',
    type: 'missing-discussion',
    message: `Day ${ctx.day}: discussion is missing or empty`,
    severity: 'warning',
    canNavigate: true,
  });
};

const validateDay = (
  day: DayType,
  forecastCycle: ForecastCycle,
  accumulator: ValidationAccumulator,
): void => {
  const ctx = createDayContext(day, forecastCycle, accumulator);

  if (!ctx.dayData) {
    addMissingDayIssues(ctx);
    return;
  }

  validateOutlookPolygons(ctx);
  validateNoTstmForecast(ctx);
  validateDiscussion(ctx);
};

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Validates whether a forecast cycle is complete.
 */
export function validateCycleCompletion(
  forecastCycle: ForecastCycle,
  expectedGroupings?: StandardGrouping[],
): CycleValidationResult {
  const accumulator: ValidationAccumulator = {
    issues: [],
    missingGroupings: new Set<StandardGrouping>(),
  };

  for (const day of collectDaysToValidate(expectedGroupings)) {
    validateDay(day, forecastCycle, accumulator);
  }

  const missingGroupings = Array.from(accumulator.missingGroupings).sort();
  const isComplete = accumulator.issues.every((issue) => issue.severity !== 'critical');

  return {
    isComplete,
    issues: accumulator.issues,
    missingGroupings,
  };
}
