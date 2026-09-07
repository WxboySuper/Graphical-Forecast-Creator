import type { DiscussionData } from '../types/outlooks';
import { mergeDiscussionDrafts } from '../utils/discussionGrouping';
import type { ForecastState } from './forecastSlice';

/** Migrates unpublished discussion drafts when grouping scopes change. */
export const applyDiscussionDraftMigrations = (
  state: ForecastState,
  migrations: Record<string, string>,
  preferScopeId?: string,
): void => {
  const preferredDraft = preferScopeId ? state.discussionDraftsByScope[preferScopeId] : undefined;
  const nextDrafts = { ...state.discussionDraftsByScope };
  const targetsToSources = new Map<string, string[]>();

  Object.entries(migrations).forEach(([fromScopeId, toScopeId]) => {
    const sources = targetsToSources.get(toScopeId) ?? [];
    sources.push(fromScopeId);
    targetsToSources.set(toScopeId, sources);
  });

  targetsToSources.forEach((fromScopeIds, toScopeId) => {
    const sourceDrafts = fromScopeIds
      .map((scopeId) => nextDrafts[scopeId])
      .filter(Boolean) as DiscussionData[];
    const mergedDraft = mergeDiscussionDrafts(sourceDrafts, preferredDraft);
    if (mergedDraft) nextDrafts[toScopeId] = mergedDraft;
  });

  const removedScopeIds = new Set(Object.keys(migrations));
  state.discussionDraftsByScope = Object.fromEntries(
    Object.entries(nextDrafts).filter(([scopeId]) => !removedScopeIds.has(scopeId)),
  ) as Record<string, DiscussionData>;
};
