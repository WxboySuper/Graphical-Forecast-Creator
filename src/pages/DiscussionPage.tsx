import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
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
import { RootState } from '../store';
import { updateDiscussion } from '../store/forecastSlice';
import { DiscussionMode, DiscussionData, DayType } from '../types/outlooks';
import { compileDiscussionToText, exportDiscussionToFile } from '../utils/discussionUtils';
import DIYDiscussionEditor from '../components/DiscussionEditor/DIYDiscussionEditor';
import GuidedDiscussionEditor from '../components/DiscussionEditor/GuidedDiscussionEditor';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import type { AddToastFn } from '../components/Layout';

interface PageContext {
  addToast: AddToastFn;
}

const DISCUSSION_AUTOSAVE_DELAY_MS = 1500;

type GuidedContentState = NonNullable<DiscussionData['guidedContent']>;

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
  hasUnsavedChanges: boolean;
  onExport: () => void;
  onSave: () => void;
}> = ({ currentDay, hasUnsavedChanges, onExport, onSave }) => (
  <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Forecast Discussion
        </h1>
        <Badge variant="secondary">Day {currentDay}</Badge>
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
}) => (
  <div className="flex-shrink-0 p-4 bg-muted/30 border-b border-border">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-1">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Valid From
        </label>
        <Input
          type="datetime-local"
          value={validStart}
          onChange={(e) => onValidStartChange(e.target.value)}
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
          onChange={(e) => onValidEndChange(e.target.value)}
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
          onChange={(e) => onForecasterNameChange(e.target.value)}
          placeholder="Your name or username"
          maxLength={100}
          className="h-9"
        />
      </div>
    </div>

    <div className="mt-3 flex items-center gap-2 text-sm text-orange-900 dark:text-warning-foreground bg-warning/20 px-3 py-2 rounded-md">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span><strong>UNOFFICIAL OUTLOOK</strong> - For educational purposes only.</span>
    </div>
  </div>
);

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
    className="flex-1 flex flex-col overflow-hidden"
  >
    <div className="flex-shrink-0 px-4 pt-4">
      <TabsList className="grid w-full max-w-xs grid-cols-2">
        <TabsTrigger value="diy" className="flex items-center gap-2">
          <Edit3 className="h-4 w-4" />
          DIY Editor
        </TabsTrigger>
        <TabsTrigger value="guided" className="flex items-center gap-2">
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
    <div className="p-4 bg-card rounded-md">
      <pre className="whitespace-pre-wrap font-mono text-sm text-foreground leading-relaxed">
        {compiledText}
      </pre>
    </div>
  </div>
);

// The DiscussionPreviewPane component renders the right-hand pane of the discussion page,
const DiscussionPreviewPane: React.FC<{ compiledText: string }> = ({ compiledText }) => (
  <div className="w-[45%] flex-shrink-0 flex flex-col overflow-hidden bg-muted/20">
    <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-2">
      <Eye className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium text-sm">Live Preview</span>
    </div>

    <DiscussionPreviewCard compiledText={compiledText} />
  </div>
);

// The useDiscussionEditorState hook encapsulates all the state management logic for the discussion editor,
const useDiscussionEditorState = (
  existingDiscussion: DiscussionData | undefined,
  currentDay: DayType,
  dispatch: ReturnType<typeof useDispatch>,
  addToast: AddToastFn
): DiscussionEditorState => {
  const [mode, setMode] = useState<DiscussionMode>(existingDiscussion?.mode || 'diy');
  const [validStart, setValidStartValue] = useState(existingDiscussion?.validStart || new Date().toISOString().slice(0, 16));
  const [validEnd, setValidEndValue] = useState(getInitialValidEnd(existingDiscussion));
  const [forecasterName, setForecasterNameValue] = useState(existingDiscussion?.forecasterName || '');
  const [diyContent, setDiyContent] = useState(existingDiscussion?.diyContent || '');
  const [guidedContent, setGuidedContent] = useState<GuidedContentState>(existingDiscussion?.guidedContent || createDefaultGuidedContent());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Marks the discussion as having unsaved changes, which triggers the auto-save effect after a debounce.
  const markUnsaved = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  // The following handlers update the respective pieces of state and mark the discussion as having unsaved changes whenever the user modifies any field.
  const setValidStart = useCallback((value: string) => {
    setValidStartValue(value);
    markUnsaved();
  }, [markUnsaved]);

  // Updates the valid end time in state and marks the discussion as having unsaved changes.
  const setValidEnd = useCallback((value: string) => {
    setValidEndValue(value);
    markUnsaved();
  }, [markUnsaved]);

  // Updates the forecaster name in state and marks the discussion as having unsaved changes.
  const setForecasterName = useCallback((value: string) => {
    setForecasterNameValue(value);
    markUnsaved();
  }, [markUnsaved]);

  // Updates the discussion mode (DIY vs Guided) and marks the discussion as having unsaved changes.
  const handleModeChange = useCallback((value: string) => {
    setMode(value as DiscussionMode);
    markUnsaved();
  }, [markUnsaved]);

  // Updates the DIY content in state and marks the discussion as having unsaved changes.
  const handleContentChange = useCallback((newContent: string) => {
    setDiyContent(newContent);
    markUnsaved();
  }, [markUnsaved]);

  // Updates the guided content in state and marks the discussion as having unsaved changes.
  const handleGuidedChange = useCallback((newContent: GuidedContentState) => {
    setGuidedContent(newContent);
    markUnsaved();
  }, [markUnsaved]);

  // Builds the complete discussion data object based on the current state of the editor, which is used for saving and exporting.
  const buildDiscussionData = useCallback((): DiscussionData => ({
    mode,
    validStart,
    validEnd,
    forecasterName,
    diyContent: mode === 'diy' ? diyContent : undefined,
    guidedContent: mode === 'guided' ? guidedContent : undefined,
    lastModified: new Date().toISOString()
  }), [mode, validStart, validEnd, forecasterName, diyContent, guidedContent]);

  // Compiles the discussion data into a text format suitable for preview and export, using a utility function that formats the content based on the selected mode and metadata.
  const compiledText = useMemo(() => {
    return compileDiscussionToText(buildDiscussionData(), currentDay);
  }, [buildDiscussionData, currentDay]);

  // Calculates the current word count of the discussion content for display in the status bar, counting words from either the DIY content or the combined guided content based on the selected mode.
  const wordCount = useMemo(() => {
    const text = mode === 'diy' ? diyContent : Object.values(guidedContent).join(' ');
    return text.trim().split(/\s+/).filter(Boolean).length;
  }, [mode, diyContent, guidedContent]);

  // Handles the save action by dispatching the updated discussion data to the Redux store, resetting the unsaved changes flag, and showing a success toast notification.
  const handleSave = useCallback(() => {
    dispatch(updateDiscussion({ day: currentDay, discussion: buildDiscussionData() }));
    setHasUnsavedChanges(false);
    addToast('Discussion saved!', 'success');
  }, [dispatch, currentDay, buildDiscussionData, addToast]);

  // Handles the export action by compiling the discussion data into text, triggering a file download, and showing a success toast notification.
  const handleExport = useCallback(() => {
    exportDiscussionToFile(buildDiscussionData(), currentDay);
    addToast('Discussion exported!', 'success');
  }, [buildDiscussionData, currentDay, addToast]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
        return () => {};
      }

    // Auto-saves the discussion data to the Redux store after a short debounce whenever there are unsaved changes.
    // This ensures that the global auto-save mechanism (which saves to localStorage) captures the latest discussion state even if the user doesn't click the Save button.
    const timer = setTimeout(() => {
      dispatch(updateDiscussion({ day: currentDay, discussion: buildDiscussionData() }));
      setHasUnsavedChanges(false);
    }, DISCUSSION_AUTOSAVE_DELAY_MS);

    return () => { clearTimeout(timer); };
  }, [hasUnsavedChanges, dispatch, currentDay, buildDiscussionData]);

  return {
    mode,
    validStart,
    validEnd,
    forecasterName,
    diyContent,
    guidedContent,
    hasUnsavedChanges,
    compiledText,
    wordCount,
    setValidStart,
    setValidEnd,
    setForecasterName,
    handleModeChange,
    handleContentChange,
    handleGuidedChange,
    handleSave,
    handleExport
  };
};

// The DiscussionPage component is the main component for the forecast discussion page,
// which integrates all the subcomponents and manages the overall state of the discussion editor through the useDiscussionEditorState hook.
export const DiscussionPage: React.FC = () => {
  const dispatch = useDispatch();
  const { addToast } = useOutletContext<PageContext>();
  
  const currentDay = useSelector((state: RootState) => state.forecast.forecastCycle.currentDay);
  const outlookDay = useSelector((state: RootState) => state.forecast.forecastCycle.days[currentDay]);
  const existingDiscussion = outlookDay?.discussion;
  const editorState = useDiscussionEditorState(existingDiscussion, currentDay, dispatch, addToast);

  return (
    <div className="h-full flex flex-col bg-background">
      <DiscussionHeaderBar
        currentDay={currentDay}
        hasUnsavedChanges={editorState.hasUnsavedChanges}
        onExport={editorState.handleExport}
        onSave={editorState.handleSave}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
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
            lastModified={existingDiscussion?.lastModified}
          />
        </div>

        <DiscussionPreviewPane compiledText={editorState.compiledText} />
      </div>
    </div>
  );
};

export default DiscussionPage;
