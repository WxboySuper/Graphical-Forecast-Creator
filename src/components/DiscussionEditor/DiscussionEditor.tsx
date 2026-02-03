import React, { useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { updateDiscussion } from '../../store/forecastSlice';
import { DiscussionMode, DiscussionData } from '../../types/outlooks';
import { compileDiscussionToText, exportDiscussionToFile } from '../../utils/discussionUtils';
import DIYDiscussionEditor from './DIYDiscussionEditor';
import GuidedDiscussionEditor from './GuidedDiscussionEditor';
import './DiscussionEditor.css';

interface DiscussionEditorProps {
  onClose: () => void;
}

const DiscussionEditor: React.FC<DiscussionEditorProps> = ({ onClose }) => {
  const dispatch = useDispatch();
  const currentDay = useSelector((state: RootState) => state.forecast.forecastCycle.currentDay);
  const outlookDay = useSelector((state: RootState) => state.forecast.forecastCycle.days[currentDay]);
  
  const existingDiscussion = outlookDay?.discussion;
  
  const [viewTab, setViewTab] = useState<'edit' | 'preview'>('edit');
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

  const handleSave = () => {
    const discussion: DiscussionData = {
      mode,
      validStart,
      validEnd,
      forecasterName,
      diyContent: mode === 'diy' ? diyContent : undefined,
      guidedContent: mode === 'guided' ? guidedContent : undefined,
      lastModified: new Date().toISOString()
    };
    
    dispatch(updateDiscussion({ day: currentDay, discussion }));
    onClose();
  };

  const handleExport = () => {
    const discussion: DiscussionData = {
      mode,
      validStart,
      validEnd,
      forecasterName,
      diyContent: mode === 'diy' ? diyContent : undefined,
      guidedContent: mode === 'guided' ? guidedContent : undefined,
      lastModified: new Date().toISOString()
    };
    
    exportDiscussionToFile(discussion, currentDay);
  };

  // Compile the discussion to text for preview
  const compiledText = useMemo(() => {
    const discussion: DiscussionData = {
      mode,
      validStart,
      validEnd,
      forecasterName,
      diyContent: mode === 'diy' ? diyContent : undefined,
      guidedContent: mode === 'guided' ? guidedContent : undefined,
      lastModified: new Date().toISOString()
    };
    
    return compileDiscussionToText(discussion, currentDay);
  }, [mode, validStart, validEnd, forecasterName, diyContent, guidedContent, currentDay]);

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
    <div className="discussion-editor-overlay">
      <div className="discussion-editor-modal">
        <div className="discussion-editor-header">
          <h2>Forecast Discussion - Day {currentDay}</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        {/* Tab navigation */}
        <div className="discussion-tabs">
          <button
            className={`tab-button ${viewTab === 'edit' ? 'active' : ''}`}
            onClick={() => setViewTab('edit')}
          >
            📝 Edit Discussion
          </button>
          <button
            className={`tab-button ${viewTab === 'preview' ? 'active' : ''}`}
            onClick={() => setViewTab('preview')}
          >
            👁️ Preview Output
          </button>
        </div>

        <div className="discussion-editor-content">
          {viewTab === 'edit' ? (
            <>
              {/* Header Information */}
              <div className="discussion-header-section">
                <div className="validity-section">
                  <div className="validity-field">
                    <label htmlFor="valid-start">Valid From:</label>
                    <input
                      id="valid-start"
                      type="datetime-local"
                      value={validStart}
                      onChange={(e) => setValidStart(e.target.value)}
                    />
                    <span className="formatted-time">{formatDateTime(validStart)}</span>
                  </div>
                  <div className="validity-field">
                    <label htmlFor="valid-end">Valid To:</label>
                    <input
                      id="valid-end"
                      type="datetime-local"
                      value={validEnd}
                      onChange={(e) => setValidEnd(e.target.value)}
                    />
                    <span className="formatted-time">{formatDateTime(validEnd)}</span>
                  </div>
                </div>
                
                <div className="forecaster-section">
                  <label htmlFor="forecaster-name">Forecaster:</label>
                  <input
                    id="forecaster-name"
                    type="text"
                    value={forecasterName}
                    onChange={(e) => setForecasterName(e.target.value)}
                    placeholder="Enter your name or username"
                    maxLength={100}
                  />
                </div>
                
                <div className="disclaimer">
                  <strong>⚠️ UNOFFICIAL OUTLOOK</strong> - For educational purposes only.
                </div>
              </div>

              {/* Mode Selection */}
              <div className="mode-selection">
                <label>Discussion Mode:</label>
                <div className="mode-buttons">
                  <button 
                    className={`mode-button ${mode === 'diy' ? 'active' : ''}`}
                    onClick={() => setMode('diy')}
                  >
                    DIY Editor
                  </button>
                  <button 
                    className={` mode-button ${mode === 'guided' ? 'active' : ''}`}
                    onClick={() => setMode('guided')}
                  >
                    Guided Builder
                  </button>
                </div>
              </div>

              {/* Editor Content */}
              <div className="editor-section">
                {mode === 'diy' ? (
                  <DIYDiscussionEditor 
                    content={diyContent}
                    onChange={setDiyContent}
                  />
                ) : (
                  <GuidedDiscussionEditor 
                    content={guidedContent}
                    onChange={setGuidedContent}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="preview-container">
              <div className="preview-actions">
                <button className="export-text-button" onClick={handleExport}>
                  📄 Export as Text
                </button>
              </div>
              <pre className="discussion-preview">{compiledText}</pre>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="discussion-editor-actions">
          <button onClick={onClose} className="cancel-button">Cancel</button>
          <button onClick={handleSave} className="save-button">Save Discussion</button>
        </div>
      </div>
    </div>
  );
};

export default DiscussionEditor;
