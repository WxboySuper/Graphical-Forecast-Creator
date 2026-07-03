import type {
  StandardGrouping,
  ValidationOutlookType,
  ValidationIssue,
  CycleValidationResult,
} from '../types/workflow';
import type { ForecastCycle, DayType, OutlookType, DiscussionData } from '../types/outlooks';

// ---------------------------------------------------------------------------
// Expected outlook types per day grouping
// ---------------------------------------------------------------------------

const DAY12_OUTLOOKS: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical'];
const DAY3_OUTLOOKS: OutlookType[] = ['totalSevere', 'categorical'];
const DAY48_OUTLOOKS: OutlookType[] = ['day4-8'];

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

/** Returns true when the categorical map exists but has no non-TSTM polygons
 *  AND there are no higher risk levels set (meaning the outlook is effectively "no TSTM"). */
const isNoTstmForecast = (
  categoricalMap: Map<string, unknown[]> | undefined,
  lowProbabilityOutlooks: OutlookType[] | undefined
): boolean => {
  if (!categoricalMap) return false;
  // If categorical has no non-TSTM data at all, this is a "no TSTM" case
  if (hasCategoricalData(categoricalMap)) return false;
  // If categorical is not in low-probability, this is intentional "no TSTM"
  if (!lowProbabilityOutlooks?.includes('categorical')) return false;
  return true;
};

/** Returns true when a discussion exists and has non-empty content. */
const hasDiscussionContent = (discussion: DiscussionData | undefined): boolean => {
  if (!discussion) return false;
  if (discussion.mode === 'diy') {
    return (discussion.diyContent?.trim().length ?? 0) > 0;
  }
  // Guided mode: check if any guided section has content
  const guided = discussion.guidedContent;
  if (!guided) return false;
  return (
    (guided.synopsis?.trim().length ?? 0) > 0 ||
    (guided.meteorologicalSetup?.trim().length ?? 0) > 0 ||
    (guided.severeWeatherExpectations?.trim().length ?? 0) > 0 ||
    (guided.timing?.trim().length ?? 0) > 0 ||
    (guided.regionalBreakdown?.trim().length ?? 0) > 0 ||
    (guided.additionalConsiderations?.trim().length ?? 0) > 0
  );
};

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Validates whether a forecast cycle is complete.
 *
 * Checks:
 * 1. Each expected day has polygons drawn for all required outlook types
 *    OR the outlook is marked as low probability.
 * 2. Days with categorical outlooks have at least one non-TSTM polygon,
 *    unless the outlook is marked as low probability.
 * 3. Days with drawn polygons have a non-empty discussion.
 *
 * @param forecastCycle - The forecast cycle to validate.
 * @param expectedGroupings - Optional override for which groupings to validate.
 *                            Defaults to all standard groupings present in the cycle.
 */
export function validateCycleCompletion(
  forecastCycle: ForecastCycle,
  expectedGroupings?: StandardGrouping[]
): CycleValidationResult {
  const issues: ValidationIssue[] = [];
  const missingGroupingsSet = new Set<StandardGrouping>();

  // Determine which days to validate
  const daysToValidate: DayType[] = [];
  const groupings = expectedGroupings ?? (['day1', 'day2', 'day3', 'day4-8'] as StandardGrouping[]);

  for (const grouping of groupings) {
    // Map grouping to day numbers
    const dayNumbers: DayType[] =
      grouping === 'day1' ? [1] :
      grouping === 'day2' ? [2] :
      grouping === 'day3' ? [3] :
      [4, 5, 6, 7, 8];

    for (const dayNum of dayNumbers) {
      daysToValidate.push(dayNum);
    }
  }

  for (const day of daysToValidate) {
    const dayData = forecastCycle.days[day];
    const grouping = dayToGrouping(day);
    const expectedTypes = expectedOutlookTypesForDay(day);

    if (!dayData) {
      // Day doesn't exist — all expected types are missing
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
      continue;
    }

    const { data, metadata } = dayData;
    const lowProbabilityOutlooks = metadata.lowProbabilityOutlooks || [];

    // Check each expected outlook type
    for (const outlookType of expectedTypes) {
      const isLowProb = lowProbabilityOutlooks.includes(outlookType);

      if (isLowProb) {
        // Low probability is a valid completion state — skip polygon check
        continue;
      }

      const outlookMap = data[outlookType as keyof typeof data];
      let hasData = false;

      if (outlookType === 'categorical') {
        hasData = hasCategoricalData(outlookMap as Map<string, unknown[]> | undefined);
      } else {
        hasData = hasPolygonData(outlookMap as Map<string, unknown[]> | undefined);
      }

      if (!hasData) {
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
    }

    // Check for "no TSTM forecast" when categorical exists with no non-TSTM data
    if (
      expectedTypes.includes('categorical') &&
      !lowProbabilityOutlooks.includes('categorical')
    ) {
      const categoricalMap = data.categorical;
      if (categoricalMap && categoricalMap.size > 0 && !hasCategoricalData(categoricalMap)) {
        issues.push({
          day: grouping,
          outlookType: 'categorical',
          type: 'no-tstm-forecast',
          message: `Day ${day} categorical: no TSTM forecast (no polygons drawn)`,
          severity: 'warning',
          canNavigate: false,
        });
      }
    }

    // Check discussion presence — only required if polygons were drawn
    const hasAnyPolygon = expectedTypes.some((outlookType) => {
      if (lowProbabilityOutlooks.includes(outlookType)) return false;
      const map = data[outlookType as keyof typeof data];
      if (outlookType === 'categorical') {
        return hasCategoricalData(map as Map<string, unknown[]> | undefined);
      }
      return hasPolygonData(map as Map<string, unknown[]> | undefined);
    });

    if (hasAnyPolygon && !hasDiscussionContent(dayData.discussion)) {
      issues.push({
        day: grouping,
        outlookType: 'categorical',
        type: 'missing-discussion',
        message: `Day ${day}: discussion is missing or empty`,
        severity: 'warning',
        canNavigate: true,
      });
    }
  }

  const missingGroupings = Array.from(missingGroupingsSet).sort();
  const isComplete = issues.filter((i) => i.severity === 'critical').length === 0;

  return {
    isComplete,
    issues,
    missingGroupings,
  };
}
