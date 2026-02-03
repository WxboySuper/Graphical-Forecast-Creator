// skipcq: JS-W1028
import React, { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resetForecasts } from '../../store/forecastSlice';
import { RootState } from '../../store';
import { ForecastMapHandle } from '../Map/ForecastMap';
import './DrawingTools.css';
import { useExportMap } from './useExportMap';
import DrawingToolsHelp from './DrawingToolsHelp';
import DrawingToolsToolbar from './DrawingToolsToolbar';
import ExportModal from './ExportModal';
import ConfirmationModal from './ConfirmationModal';

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
  
  // Use feature flags instead of hardcoded disabled state
  const isExportDisabled = !featureFlags.exportMapEnabled;
  const isSaveLoadDisabled = !featureFlags.saveLoadEnabled;

  // Reset confirmation state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const {
    isExporting,
    isModalOpen,
    initiateExport,
    confirmExport,
    cancelExport
  } = useExportMap({
    mapRef,
    outlooks,
    isExportDisabled,
    addToast
  });

  const handleResetClick = useCallback(() => {
    setIsResetModalOpen(true);
  }, []);

  const handleConfirmReset = useCallback(() => {
    dispatch(resetForecasts());
    setIsResetModalOpen(false);
    addToast('Forecasts reset successfully.', 'info');
  }, [dispatch, addToast]);

  const handleCancelReset = useCallback(() => {
    setIsResetModalOpen(false);
  }, []);

  const exportTooltip = useMemo(() => isExportDisabled ? (
    <>
      Export feature is temporarily unavailable due to an issue. See <a href="https://github.com/wxboysuper/graphical-forecast-creator/issues/32" target="_blank" rel="noopener noreferrer">GitHub issue #32</a> for more information.
    </>
  ) : null, [isExportDisabled]);

  return (
    <div className="drawing-tools">
      <h3>Drawing Tools</h3>
      <DrawingToolsToolbar
        onSave={onSave}
        onLoad={onLoad}
        handleExport={initiateExport}
        handleReset={handleResetClick}
        isSaveLoadDisabled={isSaveLoadDisabled}
        isSaved={isSaved}
        isExportDisabled={isExportDisabled}
        isExporting={isExporting}
        exportTooltip={exportTooltip}
      />

      <DrawingToolsHelp
        isExportDisabled={isExportDisabled}
        isSaveLoadDisabled={isSaveLoadDisabled}
        isSaved={isSaved}
      />

      <ExportModal
        isOpen={isModalOpen}
        onConfirm={confirmExport}
        onCancel={cancelExport}
      />

      <ConfirmationModal
        isOpen={isResetModalOpen}
        title="Reset All Forecasts?"
        message="Are you sure you want to reset all forecasts? This action cannot be undone."
        confirmLabel="Reset"
        onConfirm={handleConfirmReset}
        onCancel={handleCancelReset}
      />
      
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