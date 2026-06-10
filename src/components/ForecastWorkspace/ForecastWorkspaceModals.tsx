import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import CycleHistoryModal from '../CycleManager/CycleHistoryModal';
import CopyFromPreviousModal from '../CycleManager/CopyFromPreviousModal';
import ExportModal from '../DrawingTools/ExportModal';
import type { ForecastWorkspaceController } from './useForecastWorkspaceController';

/** Confirmation dialog for the destructive "reset all drawings" action. */
const ResetConfirmDialog: React.FC<{
  open: boolean;
  onCancel: () => void;
  onReset: () => void;
}> = ({ open, onCancel, onReset }) => (
  <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Reset All Drawings?</DialogTitle>
        <DialogDescription>This will clear all outlook polygons for all days. This action cannot be undone.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" onClick={onReset}>Reset All</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/** Preview dialog for generated SPC-calibrated TSTM polygons before they become editable forecast features. */
const GeneratedTstmPreviewDialog: React.FC<{
  controller: ForecastWorkspaceController;
}> = ({ controller }) => {
  const preview = controller.generatedTstmPreview;
  const open = Boolean(preview);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) controller.onCancelGeneratedTstm(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preview Auto-Generated TSTM Lines</DialogTitle>
          <DialogDescription>
            {preview ? (
              <>
                Generated {preview.features.length} editable TSTM polygon{preview.features.length === 1 ? '' : 's'} from SPC run{' '}
                {new Date(preview.run).toLocaleString()} using forecast hours {preview.forecastHours.join(', ') || 'none'}.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {preview ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="font-semibold">Effective window</div>
              <div>{new Date(preview.effectiveStart).toLocaleString()} to {new Date(preview.effectiveEnd).toLocaleString()}</div>
            </div>
            {preview.sources ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="font-semibold">Guidance sources</div>
                <div className="text-xs text-muted-foreground">
                  {Object.entries(preview.sources)
                    .filter(([, source]) => Boolean(source))
                    .map(([name, source]) => `${name}: ${source?.product} ${source?.search}`)
                    .join(' • ') || 'No source fields matched.'}
                </div>
              </div>
            ) : null}
            {preview.warnings.length > 0 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                {preview.warnings[0]}
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={controller.onCancelGeneratedTstm}>Cancel</Button>
          <Button onClick={controller.onApplyGeneratedTstm} disabled={!preview || preview.features.length === 0}>
            Apply TSTM Lines
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Shared hidden file input plus modals used by every Forecast workspace layout. */
export const ForecastWorkspaceModals: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <>
    <input
      ref={controller.fileInputRef as unknown as React.Ref<HTMLInputElement>}
      type="file"
      accept=".json"
      onChange={controller.onFileSelect}
      className="hidden"
    />
    <CycleHistoryModal isOpen={controller.showHistoryModal} onClose={controller.onCloseHistoryModal} />
    <CopyFromPreviousModal isOpen={controller.showCopyModal} onClose={controller.onCloseCopyModal} />
    <ExportModal
      isOpen={controller.isExportModalOpen}
      onConfirm={controller.onConfirmExport}
      onCancel={controller.onCancelExport}
    />
    <ResetConfirmDialog
      open={controller.showResetConfirm}
      onCancel={controller.onCancelReset}
      onReset={controller.onReset}
    />
    <GeneratedTstmPreviewDialog controller={controller} />
  </>
);

export default ForecastWorkspaceModals;
