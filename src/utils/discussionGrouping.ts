import type { DiscussionData, DiscussionGrouping, DayType, ForecastCycle } from '../types/outlooks';
import type { StandardGrouping, WorkflowMetadata } from '../types/workflow';

export const STANDARD_DISCUSSION_GROUPINGS: readonly DiscussionGrouping[] = [
  { id: 'day1', label: 'Day 1', days: [1], discussionDay: 1 },
  { id: 'day2', label: 'Day 2', days: [2], discussionDay: 2 },
  { id: 'day3', label: 'Day 3', days: [3], discussionDay: 3 },
  { id: 'day4-8', label: 'Days 4–8', days: [4, 5, 6, 7, 8], discussionDay: 4 },
];

const STANDARD_GROUPING_IDS = new Set(STANDARD_DISCUSSION_GROUPINGS.map(({ id }) => id));

/** Returns true when a value is one of the supported forecast day numbers. */
/** @internal */
const isDayType = (value: unknown): value is DayType =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8;

/** Returns true when a discussion has user-authored content. */
export const hasDiscussionContent = (discussion: DiscussionData | undefined): boolean => {
  if (!discussion) return false;
  if (discussion.mode === 'diy') return Boolean(discussion.diyContent?.trim());
  return Boolean(
    discussion.guidedContent
      && Object.values(discussion.guidedContent).some((value) => value.trim().length > 0),
  );
};

/** Returns the standard discussion grouping for one workflow grouping. */
export const discussionGroupingForStandard = (
  grouping: StandardGrouping,
): DiscussionGrouping => STANDARD_DISCUSSION_GROUPINGS.find(({ id }) => id === grouping)
  ?? STANDARD_DISCUSSION_GROUPINGS[0];

/** Creates one discussion grouping for a standalone day route. */
export const standaloneDiscussionGrouping = (day: DayType): DiscussionGrouping => ({
  id: `day-${day}`,
  label: `Day ${day}`,
  days: [day],
  discussionDay: day,
});

/**
 * Validates persisted grouping data without silently repairing it.
 * Invalid scopes must not control export or completion behavior because a malformed
 * id, day list, or overlap can hide a legacy day discussion.
 */
/** Returns whether one persisted grouping has valid fields and day coverage. */
const hasNonEmptyText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const hasUniqueDayCoverage = (days: unknown[], discussionDay: unknown): discussionDay is DayType =>
  days.length > 0
  && days.every(isDayType)
  && new Set(days).size === days.length
  && isDayType(discussionDay)
  && days.includes(discussionDay);

const hasValidGroupingShape = (candidate: Partial<DiscussionGrouping>): candidate is DiscussionGrouping =>
  hasNonEmptyText(candidate.id)
  && hasNonEmptyText(candidate.label)
  && Array.isArray(candidate.days)
  && hasUniqueDayCoverage(candidate.days, candidate.discussionDay);

const isValidDiscussionGrouping = (
  value: unknown,
  ids: Set<string>,
  coveredDays: Set<DayType>,
): value is DiscussionGrouping => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DiscussionGrouping>;
  if (!hasValidGroupingShape(candidate)) return false;
  const id = candidate.id.trim();
  const typedDays = candidate.days;
  if (ids.has(id) || typedDays.some((day) => coveredDays.has(day))) return false;
  ids.add(id);
  typedDays.forEach((day) => coveredDays.add(day));
  return true;
};

/** Validates persisted grouping data without silently repairing it. */
export const isValidDiscussionGroupings = (value: unknown): value is DiscussionGrouping[] => {
  if (!Array.isArray(value) || value.length === 0) return false;
  const ids = new Set<string>();
  const coveredDays = new Set<DayType>();
  return value.every((grouping) => isValidDiscussionGrouping(grouping, ids, coveredDays));
};

/** Normalizes valid persisted grouping data while preserving its explicit scope boundaries. */
export const normalizeDiscussionGroupings = (
  groupings: unknown,
): DiscussionGrouping[] => {
  if (!isValidDiscussionGroupings(groupings)) return [];
  return groupings.map((grouping) => ({
    id: grouping.id.trim(),
    label: grouping.label.trim(),
    days: [...grouping.days],
    discussionDay: grouping.discussionDay,
  }));
};

/** Returns the default scopes implied by a workflow template or standalone route. */
export const getDefaultDiscussionGroupings = (
  workflowTemplate?: WorkflowMetadata,
  currentDay: DayType = 1,
): DiscussionGrouping[] => {
  const workflowGroupings = (workflowTemplate?.groupings ?? [])
    .filter((grouping): grouping is StandardGrouping => STANDARD_GROUPING_IDS.has(grouping));
  if (workflowGroupings.length > 0) return workflowGroupings.map(discussionGroupingForStandard);
  return [standaloneDiscussionGrouping(currentDay)];
};

/** Resolves persisted custom scopes, workflow defaults, or standalone day scope. */
export const getDiscussionGroupings = (
  forecastCycle: ForecastCycle,
  workflowTemplate?: WorkflowMetadata,
  currentDay: DayType = forecastCycle.currentDay,
): DiscussionGrouping[] => {
  const persisted = normalizeDiscussionGroupings(forecastCycle.discussionGroupings);
  if (persisted.length > 0) return persisted;
  return getDefaultDiscussionGroupings(workflowTemplate, currentDay);
};

/** Returns the configured grouping that owns a day, preferring an exact one-day match. */
export const getDiscussionGroupingForDay = (
  groupings: DiscussionGrouping[],
  day: DayType,
): DiscussionGrouping | undefined => groupings.find((grouping) => grouping.days.length === 1 && grouping.days[0] === day)
  ?? groupings.find((grouping) => grouping.days.includes(day));

/** Returns the grouping selected by id, falling back to the grouping containing the active day. */
export const resolveDiscussionGrouping = (
  groupings: DiscussionGrouping[],
  id: string | null | undefined,
  day: DayType,
): DiscussionGrouping => groupings.find((grouping) => grouping.id === id)
  ?? getDiscussionGroupingForDay(groupings, day)
  ?? groupings[0]
  ?? standaloneDiscussionGrouping(day);

/** Chooses the canonical legacy day that stores a grouping discussion, without copying content. */
export const getDiscussionOwnerDay = (
  forecastCycle: ForecastCycle,
  grouping: DiscussionGrouping,
): DayType => {
  if (hasDiscussionContent(forecastCycle.days[grouping.discussionDay]?.discussion)) {
    return grouping.discussionDay;
  }

  const existingDay = grouping.days.find((day) => hasDiscussionContent(forecastCycle.days[day]?.discussion));
  return existingDay ?? grouping.discussionDay;
};

/** Reads one grouping discussion from its canonical legacy day slot. */
export const getDiscussionForGrouping = (
  forecastCycle: ForecastCycle,
  grouping: DiscussionGrouping,
): DiscussionData | undefined => forecastCycle.days[getDiscussionOwnerDay(forecastCycle, grouping)]?.discussion;

/** Builds the configured/default grouping set used by completion validation. */
export const getValidationDiscussionGroupings = (
  forecastCycle: ForecastCycle,
  expectedGroupings?: StandardGrouping[],
): DiscussionGrouping[] => {
  const persisted = normalizeDiscussionGroupings(forecastCycle.discussionGroupings);
  if (persisted.length > 0) return persisted;

  const groupings = expectedGroupings ?? ['day1', 'day2', 'day3', 'day4-8'];
  return groupings.map(discussionGroupingForStandard);
};

/** Returns a stable path query value for deep-linking to a workflow discussion. */
export const discussionPathForGrouping = (grouping: DiscussionGrouping): string =>
  `/discussion?group=${encodeURIComponent(grouping.id)}`;
