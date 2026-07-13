import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { 
  FileText, 
  Eye, 
  Download, 
  Save,
  Wand2,
  Edit3,
  Calendar,
  User,
  AlertTriangle
} from 'lucide-react';
import {
  selectDiscussionDraftForDay,
  selectForecastCycle,
  selectHasActiveWorkflow,
  selectWorkflowTemplate,
  setDiscussionGroupings,
  setForecastDay,
  updateDiscussion,
  updateDiscussionDraft,
} from '../store/forecastSlice';
import type { RootState } from '../store';
import { DiscussionMode, DiscussionData, DayType, DiscussionGrouping } from '../types/outlooks';
import { compileDiscussionToText, exportDiscussionToFile } from '../utils/discussionUtils';
import { useAuth } from '../auth/AuthProvider';
import { queueProductMetric } from '../utils/productMetrics';
import {
  getDefaultDiscussionGroupings,
  getDiscussionForGrouping,
  getDiscussionGroupings,
  getDiscussionOwnerDay,
  resolveDiscussionGrouping,
} from '../utils/discussionGrouping';
import DIYDiscussionEditor from '../components/DiscussionEditor/DIYDiscussionEditor';
import GuidedDiscussionEditor from '../components/DiscussionEditor/GuidedDiscussionEditor';
import ForecastWorkflowPanel from '../components/ForecastWorkflow/ForecastWorkflowPanel';
import DiscussionScopeSection from './DiscussionScopeSection';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import type { AddToastFn } from '../components/Layout';
import './DiscussionPage.css';

interface PageContext {
  addToast: AddToastFn;
}

const DISCUSSION_AUTOSAVE_DELAY_MS = 1500;

type GuidedContentState = NonNullable<DiscussionData['guidedContent']>;

interface DiscussionFormDefaults {
  mode: DiscussionMode;
  validStart: string;
  validEnd: string;
  forecasterName: string;
  diyContent: string;
  guidedContent: GuidedContentState;
}

interface DiscussionEditorState {
  mode: DiscussionMode;
  validStart: string;
  validEnd: string;
  forecasterName: string;
  diyContent: string;
  guidedContent: GuidedContentState;
  hasUnsavedChanges: boolean;
  compiledText: string;
  wordCount: number;
  setValidStart: (value: string) => void;
  setValidEnd: (value: string) => void;
  setForecasterName: (value: string) => void;
  handleModeChange: (value: string) => void;
  handleContentChange: (newContent: string) => void;
  handleGuidedChange: (newContent: GuidedContentState) => void;
  handleSave: () => void;
  handleExport: () => void;
  persistDraft: () => void;
}

// Creates a default empty state for the guided discussion content when starting fresh or if no existing guided content is found.
const createDefaultGuidedContent = (): GuidedContentState => ({
  synopsis: '',
  meteorologicalSetup: '',
  severeWeatherExpectations: '',
  timing: '',
  regionalBreakdown: '',
  additionalConsiderations: ''
});

// Determines the initial valid end time for the discussion.
// If an existing discussion has a valid end time, it uses that.
// Otherwise, it defaults to 24 hours from the current time.
const getInitialValidEnd = (existingDiscussion?: DiscussionData): string => {
  if (existingDiscussion?.validEnd) {
    return existingDiscussion.validEnd;
  }

  const end = new Date();
  end.setHours(end.getHours() + 24);
  return end.toISOString().slice(0, 16);
};

/** Returns default form field values for the Discussion editor, seeded from an existing discussion or blank defaults. */
const getDiscussionFormDefaults = (existingDiscussion?: DiscussionData): DiscussionFormDefaults => ({
  mode: existingDiscussion?.mode ?? 'diy',
  validStart: existingDiscussion?.validStart ?? new Date().toISOString().slice(0, 16),
  validEnd: getInitialValidEnd(existingDiscussion),
  forecasterName: existingDiscussion?.forecasterName ?? '',
  diyContent: existingDiscussion?.diyContent ?? '',
  guidedContent: existingDiscussion?.guidedContent ?? createDefaultGuidedContent()
});

// Formats an ISO datetime string into a more human-readable format for display in the metadata section of the discussion editor.
const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
};

// The DiscussionHeaderBar component renders the top header of the discussion page, showing the title, current day,
// unsaved changes indicator, and action buttons for exporting and saving the discussion.
const DiscussionHeaderBar: React.FC<{
  currentDay: DayType;
  groupingLabel?: string;
  hasUnsavedChanges: boolean;
  onExport: () => void;
  onSave: () => void;
}> = ({ currentDay, groupingLabel, hasUnsavedChanges, onExport, onSave }) => (
  <div className="discussion-header-bar flex-shrink-0 border-b border-border bg-card px-6 py-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Forecast Discussion
        </h1>
        <Badge variant="secondary">{groupingLabel ?? `Day ${currentDay}`}</Badge>
        {hasUnsavedChanges && (
          <Badge variant="warning" className="animate-pulse">Unsaved</Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button variant="save" size="sm" onClick={onSave}>
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  </div>
);

// The MetadataSection component renders the top section of the discussion editor where users can input metadata about the forecast discussion,
const MetadataSection: React.FC<{
  validStart: string;
  validEnd: string;
  forecasterName: string;
  onValidStartChange: (value: string) => void;
  onValidEndChange: (value: string) => void;
  onForecasterNameChange: (value: string) => void;
}> = ({
  validStart,
  validEnd,
  forecasterName,
  onValidStartChange,
  onValidEndChange,
  onForecasterNameChange
}) => {
  // Checks if there is any data available for the given day type by looking at the Redux store's forecast cycle data. This is used to determine whether to show a data indicator on the day tabs in the header.
  const handleValidStartInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValidStartChange(e.target.value);
  };

  // Handler for when the valid end datetime input changes, which calls the onValidEndChange prop to update the state in the parent component.
  const handleValidEndInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValidEndChange(e.target.value);
  };

  // Handler for when the forecaster name input changes, which calls the onForecasterNameChange prop to update the state in the parent component.
  const handleForecasterNameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onForecasterNameChange(e.target.value);
  };

  return (
    <div className="discussion-top-rail">
    <div className="discussion-metadata-grid">
      <div className="space-y-1">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Valid From
        </label>
        <Input
          type="datetime-local"
          value={validStart}
          onChange={handleValidStartInputChange}
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">{formatDateTime(validStart)}</span>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Valid To
        </label>
        <Input
          type="datetime-local"
          value={validEnd}
          onChange={handleValidEndInputChange}
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">{formatDateTime(validEnd)}</span>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <User className="h-3 w-3" />
          Forecaster
        </label>
        <Input
          type="text"
          value={forecasterName}
          onChange={handleForecasterNameInputChange}
          placeholder="Your name or username"
          maxLength={100}
          className="h-9"
        />
      </div>
    </div>

    <div className="discussion-warning-banner mt-3 flex items-center gap-2 text-sm text-orange-900 dark:text-warning-foreground bg-warning/20 px-3 py-2 rounded-md">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span><strong>UNOFFICIAL OUTLOOK</strong> - For educational purposes only.</span>
    </div>
    </div>
  );
};

// The DiscussionTabsSection component renders the tabbed interface for switching between the DIY editor and the Guided editor,
const DiscussionTabsSection: React.FC<{
  mode: DiscussionMode;
  diyContent: string;
  guidedContent: GuidedContentState;
  onModeChange: (value: string) => void;
  onDiyChange: (value: string) => void;
  onGuidedChange: (value: GuidedContentState) => void;
}> = ({ mode, diyContent, guidedContent, onModeChange, onDiyChange, onGuidedChange }) => (
  <Tabs
    value={mode}
    onValueChange={onModeChange}
    className="discussion-editor-shell flex-1 flex flex-col overflow-hidden"
  >
    <div className="discussion-mode-toggle-wrap flex-shrink-0 px-4 pt-4">
      <TabsList className="discussion-mode-toggle w-full max-w-sm">
        <TabsTrigger value="diy" className="discussion-mode-toggle-button flex h-full items-center justify-center gap-2 leading-none">
          <Edit3 className="h-4 w-4" />
          DIY Editor
        </TabsTrigger>
        <TabsTrigger value="guided" className="discussion-mode-toggle-button flex h-full items-center justify-center gap-2 leading-none">
          <Wand2 className="h-4 w-4" />
          Guided
        </TabsTrigger>
      </TabsList>
    </div>

    <TabsContent value="diy" className="flex-1 overflow-hidden m-0 p-4">
      <div className="h-full overflow-auto">
        <DIYDiscussionEditor
          content={diyContent}
          onChange={onDiyChange}
        />
      </div>
    </TabsContent>

    <TabsContent value="guided" className="flex-1 overflow-hidden m-0 p-4">
      <div className="h-full overflow-auto">
        <GuidedDiscussionEditor
          content={guidedContent}
          onChange={onGuidedChange}
        />
      </div>
    </TabsContent>
  </Tabs>
);

// The DiscussionStatusBar component renders the bottom status bar of the discussion editor,
// showing the current word count and the last modified timestamp of the discussion.
const DiscussionStatusBar: React.FC<{ wordCount: number; lastModified?: string }> = ({ wordCount, lastModified }) => (
  <div className="flex-shrink-0 px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-sm text-muted-foreground">
    <span>{wordCount} words</span>
    {lastModified && (
      <span>Last saved: {new Date(lastModified).toLocaleString()}</span>
    )}
  </div>
);

// The DiscussionPreviewPane component renders the right-hand pane of the discussion page,
// showing a live preview of the compiled discussion text based on the current editor content and metadata.
const DiscussionPreviewCard: React.FC<{ compiledText: string }> = ({ compiledText }) => (
  <div className="flex-1 overflow-auto p-4">
    <div className="discussion-preview-card p-4 bg-card rounded-md">
      <pre className="discussion-preview-text whitespace-pre-wrap font-mono text-sm text-foreground leading-relaxed">
        {compiledText}
      </pre>
    </div>
  </div>
);

// The DiscussionPreviewPane component renders the right-hand pane of the discussion page,
const DiscussionPreviewPane: React.FC<{ compiledText: string }> = ({ compiledText }) => (
  <div className="discussion-preview-pane flex-shrink-0 flex flex-col overflow-hidden bg-muted/20">
    <div className="discussion-top-rail discussion-preview-header flex-shrink-0 flex items-center gap-2 border-b border-border">
      <Eye className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium text-sm">Live Preview</span>
    </div>

    <DiscussionPreviewCard compiledText={compiledText} />
  </div>
);

// The useDiscussionEditorState hook encapsulates all the state management logic for the discussion editor,
// Lightweight helper: build DiscussionData from form fields
const buildDiscussionDataFrom = (fields: {
  mode: DiscussionMode;
  validStart: string;
  validEnd: string;
  forecasterName: string;
  diyContent: string;
  guidedContent: GuidedContentState;
}): DiscussionData => ({
  mode: fields.mode,
  validStart: fields.validStart,
  validEnd: fields.validEnd,
  forecasterName: fields.forecasterName,
  diyContent: fields.mode === 'diy' ? fields.diyContent : undefined,
  guidedContent: fields.mode === 'guided' ? fields.guidedContent : undefined,
  lastModified: new Date().toISOString()
});

// Manages the editable form state and unsaved flag; keeps setters small and focused.
const useDiscussionFormState = (
  existingDiscussion: DiscussionData | undefined,
  defaultForecasterName: string,
  discussionKey: string,
  currentDay: DayType,
  dispatch: ReturnType<typeof useDispatch>,
) => {
  const defaults = getDiscussionFormDefaults(existingDiscussion);
  const mergedDefaults = {
    ...defaults,
    forecasterName: existingDiscussion?.forecasterName ?? defaultForecasterName,
  };

  const [mode, setMode] = useState<DiscussionMode>(mergedDefaults.mode);
  const [validStart, setValidStart] = useState(mergedDefaults.validStart);
  const [validEnd, setValidEnd] = useState(mergedDefaults.validEnd);
  const [forecasterName, setForecasterName] = useState(mergedDefaults.forecasterName);
  const [diyContent, setDiyContent] = useState(mergedDefaults.diyContent);
  const [guidedContent, setGuidedContent] = useState<GuidedContentState>(mergedDefaults.guidedContent);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const previousDiscussionKeyRef = useRef(discussionKey);
  const scopeChangedRef = useRef(false);
  const draftsRef = useRef(new Map<string, {
    mode: DiscussionMode;
    validStart: string;
    validEnd: string;
    forecasterName: string;
    diyContent: string;
    guidedContent: GuidedContentState;
  }>());

  useEffect(() => {
    const previousDiscussionKey = previousDiscussionKeyRef.current;
    if (previousDiscussionKey === discussionKey) return;
    scopeChangedRef.current = true;

    if (hasUnsavedChanges) {
      draftsRef.current.set(previousDiscussionKey, {
        mode,
        validStart,
        validEnd,
        forecasterName,
        diyContent,
        guidedContent,
      });
    }

    const savedDraft = draftsRef.current.get(discussionKey);
    const nextDefaults = getDiscussionFormDefaults(existingDiscussion);
    const next = savedDraft ?? {
      mode: nextDefaults.mode,
      validStart: nextDefaults.validStart,
      validEnd: nextDefaults.validEnd,
      forecasterName: existingDiscussion?.forecasterName ?? defaultForecasterName,
      diyContent: nextDefaults.diyContent,
      guidedContent: nextDefaults.guidedContent,
    };
    setMode(next.mode);
    setValidStart(next.validStart);
    setValidEnd(next.validEnd);
    setForecasterName(next.forecasterName);
    setDiyContent(next.diyContent);
    setGuidedContent(next.guidedContent);
    setHasUnsavedChanges(Boolean(savedDraft));
    previousDiscussionKeyRef.current = discussionKey;
  }, [discussionKey, defaultForecasterName, diyContent, existingDiscussion, forecasterName, guidedContent, hasUnsavedChanges, mode, validEnd, validStart]);

  useEffect(() => {
    if (scopeChangedRef.current) {
      scopeChangedRef.current = false;
      return;
    }
    if (previousDiscussionKeyRef.current !== discussionKey || !hasUnsavedChanges) return;
    draftsRef.current.set(discussionKey, {
      mode,
      validStart,
      validEnd,
      forecasterName,
      diyContent,
      guidedContent,
    });
  }, [discussionKey, diyContent, forecasterName, guidedContent, hasUnsavedChanges, mode, validEnd, validStart]);

  // Persist every edit synchronously in Redux so route navigation cannot unmount the only copy.
  const persistDraft = useCallback((fields: DiscussionFormDefaults) => {
    dispatch(updateDiscussionDraft({
      day: currentDay,
      draft: buildDiscussionDataFrom(fields),
    }));
  }, [currentDay, dispatch]);

  const markUnsaved = useCallback(() => setHasUnsavedChanges(true), []);

  const handleModeChange = useCallback((value: string) => {
    const nextMode = value as DiscussionMode;
    setMode(nextMode);
    markUnsaved();
    persistDraft({ mode: nextMode, validStart, validEnd, forecasterName, diyContent, guidedContent });
  }, [diyContent, forecasterName, guidedContent, markUnsaved, persistDraft, validEnd, validStart]);
  const handleValidStart = useCallback((v: string) => {
    setValidStart(v);
    markUnsaved();
    persistDraft({ mode, validStart: v, validEnd, forecasterName, diyContent, guidedContent });
  }, [diyContent, forecasterName, guidedContent, markUnsaved, mode, persistDraft, validEnd]);
  const handleValidEnd = useCallback((v: string) => {
    setValidEnd(v);
    markUnsaved();
    persistDraft({ mode, validStart, validEnd: v, forecasterName, diyContent, guidedContent });
  }, [diyContent, forecasterName, guidedContent, markUnsaved, mode, persistDraft, validStart]);
  const handleForecasterName = useCallback((v: string) => {
    setForecasterName(v);
    markUnsaved();
    persistDraft({ mode, validStart, validEnd, forecasterName: v, diyContent, guidedContent });
  }, [diyContent, guidedContent, markUnsaved, mode, persistDraft, validEnd, validStart]);
  const handleDiy = useCallback((c: string) => {
    setDiyContent(c);
    markUnsaved();
    persistDraft({ mode, validStart, validEnd, forecasterName, diyContent: c, guidedContent });
  }, [forecasterName, guidedContent, markUnsaved, mode, persistDraft, validEnd, validStart]);
  const handleGuided = useCallback((c: GuidedContentState) => {
    setGuidedContent(c);
    markUnsaved();
    persistDraft({ mode, validStart, validEnd, forecasterName, diyContent, guidedContent: c });
  }, [diyContent, forecasterName, markUnsaved, mode, persistDraft, validEnd, validStart]);

  return {
    mode,
    validStart,
    validEnd,
    forecasterName,
    diyContent,
    guidedContent,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    handleModeChange,
    handleValidStart,
    handleValidEnd,
    handleForecasterName,
    handleDiy,
    handleGuided
  } as const;
};

// Auto-save hook keeps the effect isolated and simple. Accepts a single options object
const useDiscussionAutoSave = (opts: {
  hasUnsavedChanges: boolean;
  buildDiscussionData: () => DiscussionData;
  currentDay: DayType;
  dispatch: ReturnType<typeof useDispatch>;
  clearUnsaved: (v: boolean) => void;
}) => {
  const { hasUnsavedChanges, buildDiscussionData, currentDay, dispatch, clearUnsaved } = opts;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (hasUnsavedChanges) {
      timer = setTimeout(() => {
        dispatch(updateDiscussion({ day: currentDay, discussion: buildDiscussionData() }));
        clearUnsaved(false);
      }, DISCUSSION_AUTOSAVE_DELAY_MS);
    }

    return () => { if (timer !== null) clearTimeout(timer); };
  }, [hasUnsavedChanges, buildDiscussionData, currentDay, dispatch, clearUnsaved]);
};

// Computes derived values (compiled text and word count) in a focused hook.
const useDiscussionComputed = (
  opts: {
    buildDiscussionData: () => DiscussionData;
    currentDay: DayType;
    mode: DiscussionMode;
    diyContent: string;
    guidedContent: GuidedContentState;
  }
) => {
  const { buildDiscussionData, currentDay, mode, diyContent, guidedContent } = opts;

  const compiledText = useMemo(() => compileDiscussionToText(buildDiscussionData(), currentDay), [buildDiscussionData, currentDay]);

  const wordCount = useMemo(() => {
    const text = mode === 'diy' ? diyContent : Object.values(guidedContent).join(' ');
    return text.trim().split(/\s+/).filter(Boolean).length;
  }, [mode, diyContent, guidedContent]);

  return { compiledText, wordCount } as const;
};

/** Provides save and export action callbacks for the discussion editor, dispatching to Redux and notifying via toast. */
const useDiscussionActions = (opts: {
  dispatch: ReturnType<typeof useDispatch>;
  currentDay: DayType;
  buildDiscussionData: () => DiscussionData;
  clearUnsaved: (v: boolean) => void;
  addToast: AddToastFn;
  user: ReturnType<typeof useAuth>['user'];
  onSaved: () => void;
}) => {
  const { dispatch, currentDay, buildDiscussionData, clearUnsaved, addToast, user, onSaved } = opts;

  const handleSave = useCallback(() => {
    dispatch(updateDiscussion({ day: currentDay, discussion: buildDiscussionData() }));
    clearUnsaved(false);
    queueProductMetric({ event: 'discussion_saved', user });
    addToast('Discussion saved!', 'success');
    onSaved();
  }, [dispatch, currentDay, buildDiscussionData, clearUnsaved, addToast, user, onSaved]);

  const handleExport = useCallback(() => {
    exportDiscussionToFile(buildDiscussionData(), currentDay);
    addToast('Discussion exported!', 'success');
  }, [buildDiscussionData, currentDay, addToast]);

  return { handleSave, handleExport } as const;
};

interface DiscussionEditorStateOptions {
  existingDiscussion: DiscussionData | undefined;
  defaultForecasterName: string;
  currentDay: DayType;
  discussionKey: string;
  dispatch: ReturnType<typeof useDispatch>;
  addToast: AddToastFn;
  user: ReturnType<typeof useAuth>['user'];
  onSaved: () => void;
}

/** Composes all discussion editor state — form fields, computed text, auto-save, and actions — into a single hook return value. */
const useDiscussionEditorState = ({
  existingDiscussion,
  defaultForecasterName,
  currentDay,
  discussionKey,
  dispatch,
  addToast,
  user,
  onSaved,
}: DiscussionEditorStateOptions): DiscussionEditorState => {
  const form = useDiscussionFormState(existingDiscussion, defaultForecasterName, discussionKey, currentDay, dispatch);

  const buildDiscussionData = useCallback(() => buildDiscussionDataFrom({
    mode: form.mode,
    validStart: form.validStart,
    validEnd: form.validEnd,
    forecasterName: form.forecasterName,
    diyContent: form.diyContent,
    guidedContent: form.guidedContent
  }), [form.mode, form.validStart, form.validEnd, form.forecasterName, form.diyContent, form.guidedContent]);

  const persistDraft = useCallback(() => {
    if (!form.hasUnsavedChanges) return;
    dispatch(updateDiscussion({ day: currentDay, discussion: buildDiscussionData() }));
    form.setHasUnsavedChanges(false);
  }, [buildDiscussionData, currentDay, dispatch, form.hasUnsavedChanges, form.setHasUnsavedChanges]);

  const previousScopeRef = useRef({ discussionKey, currentDay });
  useEffect(() => {
    const previousScope = previousScopeRef.current;
    if (previousScope.discussionKey !== discussionKey && form.hasUnsavedChanges) {
      // Persist the old scope before the form effect replaces its local fields for the new scope.
      dispatch(updateDiscussion({ day: previousScope.currentDay, discussion: buildDiscussionData() }));
      form.setHasUnsavedChanges(false);
    }
    previousScopeRef.current = { discussionKey, currentDay };
  }, [buildDiscussionData, currentDay, discussionKey, dispatch, form.hasUnsavedChanges, form.setHasUnsavedChanges]);

  useDiscussionAutoSave({
    hasUnsavedChanges: form.hasUnsavedChanges,
    buildDiscussionData,
    currentDay,
    dispatch,
    clearUnsaved: form.setHasUnsavedChanges
  });

  const { compiledText, wordCount } = useDiscussionComputed({
    buildDiscussionData,
    currentDay,
    mode: form.mode,
    diyContent: form.diyContent,
    guidedContent: form.guidedContent
  });

  const { handleSave, handleExport } = useDiscussionActions({
    dispatch,
    currentDay,
    buildDiscussionData,
    clearUnsaved: form.setHasUnsavedChanges,
    addToast,
    user,
    onSaved,
  });

  return {
    mode: form.mode,
    validStart: form.validStart,
    validEnd: form.validEnd,
    forecasterName: form.forecasterName,
    diyContent: form.diyContent,
    guidedContent: form.guidedContent,
    hasUnsavedChanges: form.hasUnsavedChanges,
    compiledText,
    wordCount,
    setValidStart: form.handleValidStart,
    setValidEnd: form.handleValidEnd,
    setForecasterName: form.handleForecasterName,
    handleModeChange: form.handleModeChange,
    handleContentChange: form.handleDiy,
    handleGuidedChange: form.handleGuided,
    handleSave,
    handleExport,
    persistDraft,
  };
};

// The DiscussionPage component is the main forecast discussion workflow surface.
export const DiscussionPage: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useOutletContext<PageContext>();
  const { syncedSettings, user } = useAuth();
  const forecastCycle = useSelector(selectForecastCycle);
  const hasActiveWorkflow = useSelector(selectHasActiveWorkflow);
  const workflowTemplate = useSelector(selectWorkflowTemplate);
  const currentDay = forecastCycle.currentDay;

  const groupings = useMemo(
    () => getDiscussionGroupings(forecastCycle, hasActiveWorkflow ? workflowTemplate : undefined, currentDay),
    [forecastCycle, hasActiveWorkflow, workflowTemplate, currentDay],
  );
  const defaultGroupings = useMemo(
    () => getDefaultDiscussionGroupings(hasActiveWorkflow ? workflowTemplate : undefined, currentDay),
    [currentDay, hasActiveWorkflow, workflowTemplate],
  );
  const selectedGrouping = useMemo(
    () => resolveDiscussionGrouping(groupings, searchParams.get('group'), currentDay),
    [groupings, searchParams, currentDay],
  );
  const discussionDay = getDiscussionOwnerDay(forecastCycle, selectedGrouping);
  const outlookDay = forecastCycle.days[discussionDay];
  const discussionDraft = useSelector((state: RootState) => selectDiscussionDraftForDay(state, discussionDay));
  const existingDiscussion = discussionDraft ?? getDiscussionForGrouping(forecastCycle, selectedGrouping);
  const defaultForecasterName = syncedSettings?.defaultForecasterName ?? user?.displayName ?? '';

  useEffect(() => {
    if (forecastCycle.currentDay !== discussionDay) {
      dispatch(setForecastDay(discussionDay));
    }
  }, [dispatch, discussionDay, forecastCycle.currentDay]);

  useEffect(() => {
    if (!hasActiveWorkflow || searchParams.get('group') === selectedGrouping.id) return;
    setSearchParams({ group: selectedGrouping.id }, { replace: true });
  }, [hasActiveWorkflow, searchParams, selectedGrouping.id, setSearchParams]);

  const handleCombineGroupings = useCallback((selected: DiscussionGrouping[], label: string) => {
    if (selected.length < 2) return;
    const selectedIds = new Set(selected.map((grouping) => grouping.id));
    const days = Array.from(new Set(selected.flatMap((grouping) => grouping.days))).sort((a, b) => a - b) as DayType[];
    const combined: DiscussionGrouping = {
      id: `custom-${Date.now()}`,
      label,
      days,
      discussionDay: getDiscussionOwnerDay(forecastCycle, selected[0]),
    };
    dispatch(setDiscussionGroupings([
      ...groupings.filter((grouping) => !selectedIds.has(grouping.id)),
      combined,
    ]));
    dispatch(setForecastDay(combined.discussionDay));
    setSearchParams({ group: combined.id });
  }, [dispatch, forecastCycle, groupings, setSearchParams]);

  const handleResetGroupings = useCallback(() => {
    dispatch(setDiscussionGroupings(undefined));
    const currentDefault = defaultGroupings.find((grouping) => grouping.days.includes(currentDay)) ?? defaultGroupings[0];
    setSearchParams({ group: currentDefault?.id ?? `day-${currentDay}` });
  }, [currentDay, defaultGroupings, dispatch, setSearchParams]);

  const editorState = useDiscussionEditorState({
    existingDiscussion,
    defaultForecasterName,
    currentDay: discussionDay,
    discussionKey: selectedGrouping.id,
    dispatch,
    addToast,
    user,
    onSaved: () => navigate('/forecast'),
  });

  const handleSelectGrouping = useCallback((groupingId: string) => {
    const nextGrouping = groupings.find((grouping) => grouping.id === groupingId);
    if (!nextGrouping) return;
    editorState.persistDraft();
    dispatch(setForecastDay(getDiscussionOwnerDay(forecastCycle, nextGrouping)));
    if (hasActiveWorkflow) setSearchParams({ group: groupingId });
  }, [dispatch, editorState, forecastCycle, groupings, hasActiveWorkflow, setSearchParams]);

  return (
    <div className="h-full flex flex-col bg-background">
      <ForecastWorkflowPanel context="discussion" />
      <DiscussionHeaderBar
        currentDay={discussionDay}
        groupingLabel={selectedGrouping.label}
        hasUnsavedChanges={editorState.hasUnsavedChanges}
        onExport={editorState.handleExport}
        onSave={editorState.handleSave}
      />
      <DiscussionScopeSection
        groupings={groupings}
        selectedGrouping={selectedGrouping}
        onSelect={handleSelectGrouping}
        onCombine={handleCombineGroupings}
        onReset={handleResetGroupings}
      />

      <div className="discussion-layout flex-1 flex overflow-hidden">
        <div className="discussion-editor-pane flex flex-col overflow-hidden border-r border-border">
          <MetadataSection
            validStart={editorState.validStart}
            validEnd={editorState.validEnd}
            forecasterName={editorState.forecasterName}
            onValidStartChange={editorState.setValidStart}
            onValidEndChange={editorState.setValidEnd}
            onForecasterNameChange={editorState.setForecasterName}
          />

          <DiscussionTabsSection
            mode={editorState.mode}
            diyContent={editorState.diyContent}
            guidedContent={editorState.guidedContent}
            onModeChange={editorState.handleModeChange}
            onDiyChange={editorState.handleContentChange}
            onGuidedChange={editorState.handleGuidedChange}
          />

          <DiscussionStatusBar
            wordCount={editorState.wordCount}
            lastModified={outlookDay?.discussion?.lastModified}
          />
        </div>

        <DiscussionPreviewPane compiledText={editorState.compiledText} />
      </div>
    </div>
  );
};

export default DiscussionPage;
