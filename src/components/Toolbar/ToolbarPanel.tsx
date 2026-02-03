import React, { useRef, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  Save, 
  Upload, 
  History, 
  Copy, 
  Image as ImageIcon, 
  Trash2,
  Menu
} from 'lucide-react';
import { FloatingPanel } from '../Layout';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { RootState } from '../../store';
import { resetForecasts, selectCurrentOutlooks } from '../../store/forecastSlice';
import { ForecastMapHandle } from '../Map/ForecastMap';
import CycleHistoryModal from '../CycleManager/CycleHistoryModal';
import CopyFromPreviousModal from '../CycleManager/CopyFromPreviousModal';
import ExportModal from '../DrawingTools/ExportModal';
import { useExportMap } from '../DrawingTools/useExportMap';
import type { AddToastFn } from '../Layout';

interface ToolbarPanelProps {
  onSave: () => void;
  onLoad: (file: File) => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  addToast: AddToastFn;
}

export const ToolbarPanel: React.FC<ToolbarPanelProps> = ({
  onSave,
  onLoad,
  mapRef,
  addToast,
}) => {
  const dispatch = useDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const outlooks = useSelector(selectCurrentOutlooks);
  const isExportDisabled = useSelector((state: RootState) => state.featureFlags.exportMapEnabled === false);

  // Export hook
  const { isModalOpen, initiateExport, confirmExport, cancelExport } = useExportMap({
    mapRef,
    outlooks,
    isExportDisabled,
    addToast,
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoad(file);
    }
    // Reset the input so the same file can be loaded again
    e.target.value = '';
  }, [onLoad]);

  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleReset = useCallback(() => {
    dispatch(resetForecasts());
    setShowResetConfirm(false);
    addToast('All drawings reset', 'info');
  }, [dispatch, addToast]);

  return (
    <>
      <FloatingPanel
        title="Tools"
        position="bottom-left"
        icon={<Menu className="h-4 w-4" />}
        minWidth={220}
      >
        <div className="space-y-2">
          {/* File Operations */}
          <div className="space-y-1">
            <Button 
              variant="outline" 
              size="sm"
              className="w-full justify-start"
              onClick={onSave}
              disabled={isSaved}
            >
              <Save className="h-4 w-4 mr-2" />
              Save to JSON
              <span className="ml-auto text-xs text-muted-foreground">⌃S</span>
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              className="w-full justify-start"
              onClick={handleLoadClick}
            >
              <Upload className="h-4 w-4 mr-2" />
              Load from JSON
            </Button>
          </div>

          <div className="border-t border-border pt-2 space-y-1">
            <Button 
              variant="outline" 
              size="sm"
              className="w-full justify-start"
              onClick={() => setShowHistoryModal(true)}
            >
              <History className="h-4 w-4 mr-2" />
              Cycle History
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              className="w-full justify-start"
              onClick={() => setShowCopyModal(true)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy from Previous
            </Button>
          </div>

          <div className="border-t border-border pt-2 space-y-1">
            <Button 
              variant="outline" 
              size="sm"
              className="w-full justify-start"
              onClick={initiateExport}
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Export Image
            </Button>

            <Button 
              variant="destructive" 
              size="sm"
              className="w-full justify-start"
              onClick={() => setShowResetConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Reset All
            </Button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />
      </FloatingPanel>

      {/* Modals */}
      <CycleHistoryModal 
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />

      <CopyFromPreviousModal 
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
      />

      <ExportModal
        isOpen={isModalOpen}
        onConfirm={confirmExport}
        onCancel={cancelExport}
      />

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset All Drawings?</DialogTitle>
            <DialogDescription>
              This will clear all outlook polygons for all days. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Reset All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ToolbarPanel;
