// skipcq: JS-W1028
import React, { useState, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resetForecasts } from '../../store/forecastSlice';
import { RootState } from '../../store';
import { exportMapAsImage, downloadDataUrl, getFormattedDate } from '../../utils/exportUtils';
import { ForecastMapHandle } from '../Map/ForecastMap';
import './DrawingTools.css';

interface ToolButtonProps {
  onClick?: () => void;
  disabled: boolean;
  className: string;
  label: string;
  icon: string;
  maintenance?: boolean;
  tooltipText?: React.ReactNode;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  onClick,
  disabled,
  className,
  label,
  icon,
  maintenance,
  tooltipText
}) => (
  <div className="tooltip">
    <button
      className={`tool-button ${className}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
    >
      <span role="img" aria-hidden="true">{icon}</span> {label}
    </button>
    {maintenance && <span className="maintenance-badge">!</span>}
    {tooltipText && (
      <span className="tooltip-text">
        {tooltipText}
      </span>
    )}
  </div>
);

interface DrawingToolsProps {
  onSave: () => void;
  onLoad: () => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const DrawingTools: React.FC<DrawingToolsProps> = ({ onSave, onLoad, mapRef, addToast }) => {
  const dispatch = useDispatch();
  const { isSaved, outlooks } = useSelector((state: RootState) => state.forecast);
  const featureFlags = useSelector((state: RootState) => state.featureFlags);
  const [isExporting, setIsExporting] = useState(false);
  
  // Use feature flags instead of hardcoded disabled state
  const isExportDisabled = !featureFlags.exportMapEnabled;
  const isSaveLoadDisabled = !featureFlags.saveLoadEnabled;

  const handleReset = useCallback(() => {
    // skipcq: JS-0052
    if (window.confirm('Are you sure you want to reset all forecasts? This action cannot be undone.')) {
      dispatch(resetForecasts());
    }
  }, [dispatch]);

  const handleExport = async () => {
    // Don't proceed if export is disabled
    if (isExportDisabled) {
      addToast('The export feature is currently unavailable due to an issue. Please check back later or visit the GitHub repository for more information.', 'warning');
      return;
    }

    if (!mapRef.current) {
      addToast('Map reference not available. Cannot export.', 'error');
      return;
    }

    const map = mapRef.current.getMap();
    if (!map) {
      addToast('Map not fully loaded. Please try again.', 'error');
      return;
    }

    try {
      setIsExporting(true);
      
      // Show export options dialog
      // skipcq: JS-0052
      const title = prompt('Enter a title for your forecast image (optional):');
      
      // Generate the image with Redux store data
      const dataUrl = await exportMapAsImage(map, outlooks, title || undefined);
      
      // Download the image
      const filename = `forecast-outlook-${getFormattedDate()}.png`;
      downloadDataUrl(dataUrl, filename);
      addToast('Forecast exported successfully!', 'success');
      
    } catch (error) {
      console.error('Error exporting map:', error);
      addToast('Failed to export the map. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const exportTooltip = useMemo(() => isExportDisabled ? (
    <>
      Export feature is temporarily unavailable due to an issue. See <a href="https://github.com/wxboysuper/graphical-forecast-creator/issues/32" target="_blank" rel="noopener noreferrer">GitHub issue #32</a> for more information.
    </>
  ) : null, [isExportDisabled]);

  return (
    <div className="drawing-tools">
      <h3>Drawing Tools</h3>
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
      <div className="tools-help">
        <p>
          <strong>Drawing Instructions:</strong> Select an outlook type and probability, then use the drawing tools on the map to create your forecast areas.
        </p>
        <p>
          <strong>Click on any drawn area to delete it.</strong>
        </p>
        {isExportDisabled && (
          <p className="unsaved-warning">
            ⚠️ Export feature is temporarily unavailable due to an issue. See <a href="https://github.com/wxboysuper/graphical-forecast-creator/issues/32" target="_blank" rel="noopener noreferrer">GitHub issue #32</a> for more information.
          </p>
        )}
        {isSaveLoadDisabled && (
          <p className="unsaved-warning">
            ⚠️ The save/load features are temporarily unavailable due to an issue.
          </p>
        )}
        {!isSaved && (
          <p className="unsaved-warning">
            ⚠️ You have unsaved changes
          </p>
        )}
      </div>
      
      {isExporting && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">
            Generating forecast image...
          </div>
          <div className="loading-subtext">
            Processing map layers and applying significant threat patterns
          </div>
        </div>
      )}
    </div>
  );
};

export default DrawingTools;