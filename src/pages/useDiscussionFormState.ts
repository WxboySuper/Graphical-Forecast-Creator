import { useCallback, useEffect, useRef, useState } from 'react';
import { updateDiscussionDraft } from '../store/forecastSlice';
import type { DiscussionData, DiscussionMode, DayType } from '../types/outlooks';

export type GuidedContentState = NonNullable<DiscussionData['guidedContent']>;

export interface DiscussionFormDefaults {
  mode: DiscussionMode;
  validStart: string;
  validEnd: string;
  forecasterName: string;
  diyContent: string;
  guidedContent: GuidedContentState;
}

export interface DiscussionFormStateOptions {
  existingDiscussion: DiscussionData | undefined;
  defaultForecasterName: string;
  discussionKey: string;
  currentDay: DayType;
  dispatch: ReturnType<typeof import('react-redux').useDispatch>;
}

const createDefaultGuidedContent = (): GuidedContentState => ({
  synopsis: '', meteorologicalSetup: '', severeWeatherExpectations: '', timing: '',
  regionalBreakdown: '', additionalConsiderations: '',
});

const getInitialValidEnd = (existingDiscussion?: DiscussionData): string => {
  if (existingDiscussion?.validEnd) return existingDiscussion.validEnd;
  const end = new Date();
  end.setHours(end.getHours() + 24);
  return end.toISOString().slice(0, 16);
};

export const getDiscussionFormDefaults = (existingDiscussion?: DiscussionData): DiscussionFormDefaults => ({
  mode: existingDiscussion?.mode ?? 'diy',
  validStart: existingDiscussion?.validStart ?? new Date().toISOString().slice(0, 16),
  validEnd: getInitialValidEnd(existingDiscussion),
  forecasterName: existingDiscussion?.forecasterName ?? '',
  diyContent: existingDiscussion?.diyContent ?? '',
  guidedContent: existingDiscussion?.guidedContent ?? createDefaultGuidedContent(),
});

export const buildDiscussionDataFrom = (fields: DiscussionFormDefaults): DiscussionData => ({
  ...fields,
  diyContent: fields.mode === 'diy' ? fields.diyContent : undefined,
  guidedContent: fields.mode === 'guided' ? fields.guidedContent : undefined,
  lastModified: new Date().toISOString(),
});

const useDiscussionFormState = ({ existingDiscussion, defaultForecasterName, discussionKey, currentDay, dispatch }: DiscussionFormStateOptions) => {
  const defaults = getDiscussionFormDefaults(existingDiscussion);
  const initial = { ...defaults, forecasterName: existingDiscussion?.forecasterName ?? defaultForecasterName };
  const [mode, setMode] = useState<DiscussionMode>(initial.mode);
  const [validStart, setValidStart] = useState(initial.validStart);
  const [validEnd, setValidEnd] = useState(initial.validEnd);
  const [forecasterName, setForecasterName] = useState(initial.forecasterName);
  const [diyContent, setDiyContent] = useState(initial.diyContent);
  const [guidedContent, setGuidedContent] = useState<GuidedContentState>(initial.guidedContent);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const previousDiscussionKeyRef = useRef(discussionKey);
  const scopeChangedRef = useRef(false);
  const draftsRef = useRef(new Map<string, DiscussionFormDefaults>());

  const fields = { mode, validStart, validEnd, forecasterName, diyContent, guidedContent };
  useEffect(() => {
    const previousKey = previousDiscussionKeyRef.current;
    if (previousKey === discussionKey) return;
    scopeChangedRef.current = true;
    if (hasUnsavedChanges) draftsRef.current.set(previousKey, fields);
    const saved = draftsRef.current.get(discussionKey);
    const nextDefaults = getDiscussionFormDefaults(existingDiscussion);
    const next = saved ?? { ...nextDefaults, forecasterName: existingDiscussion?.forecasterName ?? defaultForecasterName };
    setMode(next.mode); setValidStart(next.validStart); setValidEnd(next.validEnd);
    setForecasterName(next.forecasterName); setDiyContent(next.diyContent); setGuidedContent(next.guidedContent);
    setHasUnsavedChanges(Boolean(saved));
    previousDiscussionKeyRef.current = discussionKey;
  // fields intentionally track the current draft while changing scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discussionKey, defaultForecasterName, existingDiscussion, hasUnsavedChanges, mode, validStart, validEnd, forecasterName, diyContent, guidedContent]);

  useEffect(() => {
    if (scopeChangedRef.current) { scopeChangedRef.current = false; return; }
    if (previousDiscussionKeyRef.current !== discussionKey || !hasUnsavedChanges) return;
    draftsRef.current.set(discussionKey, fields);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discussionKey, hasUnsavedChanges, mode, validStart, validEnd, forecasterName, diyContent, guidedContent]);

  const persist = useCallback((next: DiscussionFormDefaults) => dispatch(updateDiscussionDraft({ day: currentDay, draft: {
    ...next, diyContent: next.mode === 'diy' ? next.diyContent : undefined,
    guidedContent: next.mode === 'guided' ? next.guidedContent : undefined, lastModified: new Date().toISOString(),
  } })), [currentDay, dispatch]);
  const update = useCallback((next: DiscussionFormDefaults) => { setHasUnsavedChanges(true); persist(next); }, [persist]);
  const handleModeChange = useCallback((value: string) => { const next = { ...fields, mode: value as DiscussionMode }; setMode(next.mode); update(next); }, [fields, update]);
  const handleValidStart = useCallback((value: string) => { const next = { ...fields, validStart: value }; setValidStart(value); update(next); }, [fields, update]);
  const handleValidEnd = useCallback((value: string) => { const next = { ...fields, validEnd: value }; setValidEnd(value); update(next); }, [fields, update]);
  const handleForecasterName = useCallback((value: string) => { const next = { ...fields, forecasterName: value }; setForecasterName(value); update(next); }, [fields, update]);
  const handleDiy = useCallback((value: string) => { const next = { ...fields, diyContent: value }; setDiyContent(value); update(next); }, [fields, update]);
  const handleGuided = useCallback((value: GuidedContentState) => { const next = { ...fields, guidedContent: value }; setGuidedContent(value); update(next); }, [fields, update]);
  return { mode, validStart, validEnd, forecasterName, diyContent, guidedContent, hasUnsavedChanges, setHasUnsavedChanges,
    handleModeChange, handleValidStart, handleValidEnd, handleForecasterName, handleDiy, handleGuided } as const;
};

export default useDiscussionFormState;
