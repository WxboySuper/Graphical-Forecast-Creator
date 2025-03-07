import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resetForecasts } from '../../store/forecastSlice';
import { RootState } from '../../store';
import { exportMapAsImage, downloadDataUrl, getFormattedDate } from '../../utils/exportUtils';
import { ForecastMapHandle } from '../Map/ForecastMap';
import './DrawingTools.css';

interface DrawingToolsProps {
  onSave: () => void;
  onLoad: () => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
}

const DrawingTools: React.FC<DrawingToolsProps> = ({ onSave, onLoad, mapRef }) => {
  const dispatch = useDispatch();
  const { isSaved } = useSelector((state: RootState) => state.forecast);
  const [isExporting, setIsExporting] = useState(false);
  
  // Flag to disable export feature - set to true to disable
  const isExportDisabled = true;

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all forecasts? This action cannot be undone.')) {
      dispatch(resetForecasts());
    }
  };

  const handleExport = async () => {
    // Don't proceed if export is disabled
    if (isExportDisabled) {
      alert('The export feature is currently unavailable due to an issue. Please check back later or visit the GitHub repository for more inforamtion.');
      return;
    }

    if (!mapRef.current) {
      alert('Map reference not available. Cannot export.');
      return;
    }

    const map = mapRef.current.getMap();
    if (!map) {
      alert('Map not fully loaded. Please try again.');
      return;
    }

    try {
      setIsExporting(true);
      
      // Show export options dialog
      const title = prompt('Enter a title for your forecast image (optional):');
      
      // Generate the image
      const dataUrl = await exportMapAsImage(map, title || undefined);
      
      // Download the image
      const filename = `forecast-outlook-${getFormattedDate()}.png`;
      downloadDataUrl(dataUrl, filename);
      
    } catch (error) {
      console.error('Error exporting map:', error);
      alert('Failed to export the map. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="drawing-tools">
      <h3>Drawing Tools</h3>
      <div className="tools-container">
        <button 
          className="tool-button save-button" 
          onClick={onSave}
          disabled={isSaved}
        >
          <span className="tool-icon">💾</span>
          <span className="tool-label">Save Forecast</span>
        </button>
        <button 
          className="tool-button load-button" 
          onClick={onLoad}
        >
          <span className="tool-icon">📂</span>
          <span className="tool-label">Load Forecast</span>
        </button>
        <div className="tooltip">
          <button 
            className={`tool-button ${isExportDisabled ? 'export-button-disabled' : 'export-button'}`}
            onClick={isExportDisabled ? undefined : handleExport}
            disabled={isExporting || isExportDisabled}
          >
            <span className="tool-icon">📤</span>
            <span className="tool-label">{isExporting ? 'Exporting...' : 'Export as Image'}</span>
            {isExportDisabled && <span className="maintenance-badge">!</span>}
          </button>
          {isExportDisabled && (
            <span className="tooltip-text">
              Export feature is temporarily unavailable due to an issue. We're working on it!
            </span>
          )}
        </div>
        <button 
          className="tool-button reset-button" 
          onClick={handleReset}
        >
          <span className="tool-icon">🗑️</span>
          <span className="tool-label">Reset All</span>
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
            ⚠️ The export feature is temporarily unavailable due to an issue.
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