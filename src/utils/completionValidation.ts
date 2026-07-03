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
  return guided ? hasGuidedDiscussionContent(guided) : false;
};

const collectDaysToValidate = (expectedGroupings?: StandardGrouping[]): DayType[] => {
  const groupings = expectedGroupings ?? DEFAULT_GROUPINGS;
  return groupings.flatMap((grouping) => GROUPING_DAY_NUMBERS[grouping]);
};

const addMissingDayIssues = (
  day: DayType,
  grouping: StandardGrouping,
  expectedTypes: OutlookType[],
  issues: ValidationIssue[],
  missingGroupingsSet: Set<StandardGrouping>,
): void => {
  for (const outlookType of expectedTypes) {
    issues.push({
      day: grouping,
      outlookType: outlookType as ValidationOutlookType,
      type: 'missing-polygon',
      message: `Day ${day} ${outlookType} outlook: no data drawn`,
      severity: 'critical',
      canNavigate: true,
    });
  }
  missingGroupingsSet.add(grouping);
};

const validateOutlookPolygons = (
  day: DayType,
  dayData: OutlookDay,
  grouping: StandardGrouping,
  expectedTypes: OutlookType[],
  issues: ValidationIssue[],
  missingGroupingsSet: Set<StandardGrouping>,
): void => {
  const lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks || [];

  for (const outlookType of expectedTypes) {
    if (lowProbabilityOutlooks.includes(outlookType)) {
      continue;
    }

    const outlookMap = dayData.data[outlookType as keyof typeof dayData.data];
    if (hasOutlookData(outlookType, outlookMap as Map<string, unknown[]> | undefined)) {
      continue;
    }

    issues.push({
      day: grouping,
      outlookType: outlookType as ValidationOutlookType,
      type: 'missing-polygon',
      message: `Day ${day} ${outlookType} outlook: no polygon drawn`,
      severity: 'critical',
      canNavigate: true,
    });
    missingGroupingsSet.add(grouping);
  }
};

const validateNoTstmForecast = (
  day: DayType,
  dayData: OutlookDay,
  grouping: StandardGrouping,
  expectedTypes: OutlookType[],
  issues: ValidationIssue[],
): void => {
  const lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks || [];
  if (
    !expectedTypes.includes('categorical') ||
    lowProbabilityOutlooks.includes('categorical')
  ) {
    return;
  }

  const categoricalMap = dayData.data.categorical;
  if (!categoricalMap || categoricalMap.size === 0 || hasCategoricalData(categoricalMap)) {
    return;
  }

  issues.push({
    day: grouping,
    outlookType: 'categorical',
    type: 'no-tstm-forecast',
    message: `Day ${day} categorical: no TSTM forecast (no polygons drawn)`,
    severity: 'warning',
    canNavigate: false,
  });
};

const dayHasDrawnPolygons = (
  dayData: OutlookDay,
  expectedTypes: OutlookType[],
): boolean => {
  const lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks || [];

  return expectedTypes.some((outlookType) => {
    if (lowProbabilityOutlooks.includes(outlookType)) {
      return false;
    }

    const map = dayData.data[outlookType as keyof typeof dayData.data];
    return hasOutlookData(outlookType, map as Map<string, unknown[]> | undefined);
  });
};

const validateDiscussion = (
  day: DayType,
  dayData: OutlookDay,
  grouping: StandardGrouping,
  expectedTypes: OutlookType[],
  issues: ValidationIssue[],
): void => {
  if (!dayHasDrawnPolygons(dayData, expectedTypes) || hasDiscussionContent(dayData.discussion)) {
    return;
  }

  issues.push({
    day: grouping,
    outlookType: 'categorical',
    type: 'missing-discussion',
    message: `Day ${day}: discussion is missing or empty`,
    severity: 'warning',
    canNavigate: true,
  });
};

const validateDay = (
  day: DayType,
  forecastCycle: ForecastCycle,
  issues: ValidationIssue[],
  missingGroupingsSet: Set<StandardGrouping>,
): void => {
  const grouping = dayToGrouping(day);
  const expectedTypes = expectedOutlookTypesForDay(day);
  const dayData = forecastCycle.days[day];

  if (!dayData) {
    addMissingDayIssues(day, grouping, expectedTypes, issues, missingGroupingsSet);
    return;
  }

  validateOutlookPolygons(day, dayData, grouping, expectedTypes, issues, missingGroupingsSet);
  validateNoTstmForecast(day, dayData, grouping, expectedTypes, issues);
  validateDiscussion(day, dayData, grouping, expectedTypes, issues);
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
  const issues: ValidationIssue[] = [];
  const missingGroupingsSet = new Set<StandardGrouping>();

  for (const day of collectDaysToValidate(expectedGroupings)) {
    validateDay(day, forecastCycle, issues, missingGroupingsSet);
  }

  const missingGroupings = Array.from(missingGroupingsSet).sort();
  const isComplete = issues.every((issue) => issue.severity !== 'critical');

  return {
    isComplete,
    issues,
    missingGroupings,
  };
}
