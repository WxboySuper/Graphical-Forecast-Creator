import React, { useState, useMemo, useCallback } from 'react';
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
import { DiscussionMode, DiscussionData } from '../types/outlooks';
import { compileDiscussionToText, exportDiscussionToFile } from '../utils/discussionUtils';
import DIYDiscussionEditor from '../components/DiscussionEditor/DIYDiscussionEditor';
import GuidedDiscussionEditor from '../components/DiscussionEditor/GuidedDiscussionEditor';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import type { AddToastFn } from '../components/Layout';

interface PageContext {
  addToast: AddToastFn;
}

export const DiscussionPage: React.FC = () => {
  const dispatch = useDispatch();
  const { addToast } = useOutletContext<PageContext>();
  
  const currentDay = useSelector((state: RootState) => state.forecast.forecastCycle.currentDay);
  const outlookDay = useSelector((state: RootState) => state.forecast.forecastCycle.days[currentDay]);
  
  const existingDiscussion = outlookDay?.discussion;
  
  const [mode, setMode] = useState<DiscussionMode>(existingDiscussion?.mode || 'diy');
  const [validStart, setValidStart] = useState(existingDiscussion?.validStart || new Date().toISOString().slice(0, 16));
  const [validEnd, setValidEnd] = useState(() => {
    if (existingDiscussion?.validEnd) return existingDiscussion.validEnd;
    const end = new Date();
    end.setHours(end.getHours() + 24);
    return end.toISOString().slice(0, 16);
  });
  const [forecasterName, setForecasterName] = useState(existingDiscussion?.forecasterName || '');
  const [diyContent, setDiyContent] = useState(existingDiscussion?.diyContent || '');
  const [guidedContent, setGuidedContent] = useState(existingDiscussion?.guidedContent || {
    synopsis: '',
    meteorologicalSetup: '',
    severeWeatherExpectations: '',
    timing: '',
    regionalBreakdown: '',
    additionalConsiderations: ''
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Track changes
  const handleContentChange = useCallback((newContent: string) => {
    setDiyContent(newContent);
    setHasUnsavedChanges(true);
  }, []);

  const handleGuidedChange = useCallback((newContent: typeof guidedContent) => {
    setGuidedContent(newContent);
    setHasUnsavedChanges(true);
  }, []);

  // Build discussion data object
  const buildDiscussionData = useCallback((): DiscussionData => ({
    mode,
    validStart,
    validEnd,
    forecasterName,
    diyContent: mode === 'diy' ? diyContent : undefined,
    guidedContent: mode === 'guided' ? guidedContent : undefined,
    lastModified: new Date().toISOString()
  }), [mode, validStart, validEnd, forecasterName, diyContent, guidedContent]);

  // Compile the discussion to text for preview
  const compiledText = useMemo(() => {
    return compileDiscussionToText(buildDiscussionData(), currentDay);
  }, [buildDiscussionData, currentDay]);

  // Word count
  const wordCount = useMemo(() => {
    const text = mode === 'diy' ? diyContent : Object.values(guidedContent).join(' ');
    return text.trim().split(/\s+/).filter(Boolean).length;
  }, [mode, diyContent, guidedContent]);

  const handleSave = useCallback(() => {
    dispatch(updateDiscussion({ day: currentDay, discussion: buildDiscussionData() }));
    setHasUnsavedChanges(false);
    addToast('Discussion saved!', 'success');
  }, [dispatch, currentDay, buildDiscussionData, addToast]);

  const handleExport = useCallback(() => {
    exportDiscussionToFile(buildDiscussionData(), currentDay);
    addToast('Discussion exported!', 'success');
  }, [buildDiscussionData, currentDay, addToast]);

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

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header Bar */}
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
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="save" size="sm" onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Side */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
          {/* Metadata Section */}
          <div className="flex-shrink-0 p-4 bg-muted/30 border-b border-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Valid From */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Valid From
                </label>
                <Input
                  type="datetime-local"
                  value={validStart}
                  onChange={(e) => {
                    setValidStart(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="h-9"
                />
                <span className="text-xs text-muted-foreground">{formatDateTime(validStart)}</span>
              </div>
              
              {/* Valid To */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Valid To
                </label>
                <Input
                  type="datetime-local"
                  value={validEnd}
                  onChange={(e) => {
                    setValidEnd(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="h-9"
                />
                <span className="text-xs text-muted-foreground">{formatDateTime(validEnd)}</span>
              </div>
              
              {/* Forecaster */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Forecaster
                </label>
                <Input
                  type="text"
                  value={forecasterName}
                  onChange={(e) => {
                    setForecasterName(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Your name or username"
                  maxLength={100}
                  className="h-9"
                />
              </div>
            </div>
            
            {/* Disclaimer */}
            <div className="mt-3 flex items-center gap-2 text-sm text-orange-900 dark:text-warning-foreground bg-warning/20 px-3 py-2 rounded-md">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span><strong>UNOFFICIAL OUTLOOK</strong> - For educational purposes only.</span>
            </div>
          </div>

          {/* Mode Tabs */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as DiscussionMode)} className="flex-1 flex flex-col overflow-hidden">
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
                  onChange={handleContentChange}
                />
              </div>
            </TabsContent>

            <TabsContent value="guided" className="flex-1 overflow-hidden m-0 p-4">
              <div className="h-full overflow-auto">
                <GuidedDiscussionEditor 
                  content={guidedContent}
                  onChange={handleGuidedChange}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Status Bar */}
          <div className="flex-shrink-0 px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-sm text-muted-foreground">
            <span>{wordCount} words</span>
            {existingDiscussion?.lastModified && (
              <span>Last saved: {new Date(existingDiscussion.lastModified).toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* Preview Side */}
        <div className="w-[45%] flex-shrink-0 flex flex-col overflow-hidden bg-muted/20">
          <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Live Preview</span>
          </div>
          
          <div className="flex-1 overflow-auto p-4">
            <Card>
              <CardContent className="p-4">
                <pre className="whitespace-pre-wrap font-mono text-sm text-foreground leading-relaxed">
                  {compiledText}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscussionPage;
