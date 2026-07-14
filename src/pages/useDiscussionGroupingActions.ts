import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  resetDiscussionGroupings,
  setDiscussionGroupings,
  setForecastDay,
} from '../store/forecastSlice';
import type { DayType, DiscussionGrouping, ForecastCycle } from '../types/outlooks';
import { getDiscussionOwnerDay } from '../utils/discussionGrouping';

const combineDiscussionGroupings = (
  selected: DiscussionGrouping[],
  label: string,
  forecastCycle: ForecastCycle,
): DiscussionGrouping => ({
  id: `custom-${Date.now()}`,
  label,
  days: Array.from(new Set(selected.flatMap(({ days }) => days))).sort((a, b) => a - b) as DayType[],
  discussionDay: getDiscussionOwnerDay(forecastCycle, selected[0]),
});

interface DiscussionGroupingActionsOptions {
  forecastCycle: ForecastCycle;
  groupings: DiscussionGrouping[];
  defaultGroupings: DiscussionGrouping[];
  currentDay: DayType;
}

export const useDiscussionGroupingActions = ({
  forecastCycle,
  groupings,
  defaultGroupings,
  currentDay,
}: DiscussionGroupingActionsOptions) => {
  const dispatch = useDispatch();
  const [, setSearchParams] = useSearchParams();

  const handleCombine = useCallback((selected: DiscussionGrouping[], label: string) => {
    if (selected.length < 2) return;
    const selectedIds = new Set(selected.map(({ id }) => id));
    const combined = combineDiscussionGroupings(selected, label, forecastCycle);
    dispatch(setDiscussionGroupings([
      ...groupings.filter(({ id }) => !selectedIds.has(id)),
      combined,
    ]));
    dispatch(setForecastDay(combined.discussionDay));
    setSearchParams({ group: combined.id });
  }, [dispatch, forecastCycle, groupings, setSearchParams]);

  const handleReset = useCallback(() => {
    dispatch(resetDiscussionGroupings());
    const currentDefault = defaultGroupings.find(({ days }) => days.includes(currentDay)) ?? defaultGroupings[0];
    setSearchParams({ group: currentDefault?.id ?? `day-${currentDay}` });
  }, [currentDay, defaultGroupings, dispatch, setSearchParams]);

  return { handleCombine, handleReset } as const;
};
