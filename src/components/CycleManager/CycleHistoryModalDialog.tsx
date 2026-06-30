import React from 'react';
import type { SavedCycle } from '../../store/forecastSlice';
import type { ForecastCycle } from '../../types/outlooks';
import CycleHistoryModalPanel from './CycleHistoryModalPanel';

interface CycleHistoryModalDialogProps {
  modalRef: React.RefObject<HTMLDivElement | null>;
  currentCycle: ForecastCycle;
  savedCycles: SavedCycle[];
  showSaveForm: boolean;
  newLabel: string;
  onClose: () => void;
  onOpenSaveForm: () => void;
  onNewLabelChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveCurrent: () => void;
  onCancelSaveForm: () => void;
  onLoadClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** Portaled cycle history shell and dialog content. */
const CycleHistoryModalDialog: React.FC<CycleHistoryModalDialogProps> = (props) => (
  <div className="history-modal-root notranslate">
    <div className="history-modal-overlay" onClick={props.onClose} aria-hidden="true" />
    <CycleHistoryModalPanel {...props} />
  </div>
);

export default CycleHistoryModalDialog;
