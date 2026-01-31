import React from 'react';
import ToolButton from './ToolButton';

interface DrawingToolsToolbarProps {
  onSave: () => void;
  onLoad: () => void;
  onOpenDiscussion: () => void;
  handleExport: () => void;
  handleReset: () => void;
  isSaveLoadDisabled: boolean;
  isSaved: boolean;
  isExportDisabled: boolean;
  isExporting: boolean;
  exportTooltip: React.ReactNode;
}

const DrawingToolsToolbar: React.FC<DrawingToolsToolbarProps> = ({
  onSave,
  onLoad,
  onOpenDiscussion,
  handleExport,
  handleReset,
  isSaveLoadDisabled,
  isSaved,
  isExportDisabled,
  isExporting,
  exportTooltip
}) => {
  return (
    <div className="tools-container">
      <ToolButton
        className={isSaveLoadDisabled ? 'button-disabled' : 'save-button'}
        onClick={onSave}
        disabled={isSaveLoadDisabled || isSaved}
        label="Save Forecast"
        icon="💾"
        maintenance={isSaveLoadDisabled}
        tooltipText={isSaveLoadDisabled ? "Save feature is temporarily unavailable" : null}
      />

      <ToolButton
        className={isSaveLoadDisabled ? 'button-disabled' : 'load-button'}
        onClick={onLoad}
        disabled={isSaveLoadDisabled}
        label="Load Forecast"
        icon="📂"
        maintenance={isSaveLoadDisabled}
        tooltipText={isSaveLoadDisabled ? "Load feature is temporarily unavailable" : null}
      />

      <ToolButton
        className="discussion-button"
        onClick={onOpenDiscussion}
        disabled={false}
        label="Forecast Discussion"
        icon="📝"
        maintenance={false}
        tooltipText={null}
      />

      <ToolButton
        className={isExportDisabled ? 'export-button-disabled' : 'export-button'}
        onClick={handleExport}
        disabled={isExporting || isExportDisabled}
        label={isExporting ? 'Exporting...' : 'Export as Image'}
        icon="📤"
        maintenance={isExportDisabled}
        tooltipText={exportTooltip}
      />

      <button
        className="tool-button reset-button"
        onClick={handleReset}
        aria-label="Reset All"
      >
        <span role="img" aria-hidden="true">🗑️</span> Reset All
      </button>
    </div>
  );
};

export default DrawingToolsToolbar;