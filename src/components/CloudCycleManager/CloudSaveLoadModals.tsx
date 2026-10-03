import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { AlertCircle, Cloud, Loader } from 'lucide-react';
import './CloudSaveLoadModals.css';

interface CloudSaveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (label: string) => Promise<boolean>;
  currentLabel?: string;
  error?: string;
}

interface CloudSaveDialogState {
  label: string;
  isSaving: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  setLabel: React.Dispatch<React.SetStateAction<string>>;
  handleSave: () => Promise<void>;
  handleOpenChange: (open: boolean) => void;
}

/** Header copy used by the cloud save modal. */
const CloudSaveDialogHeader: React.FC = () => (
  <DialogHeader className="cloud-save-dialog-header">
    <DialogTitle className="cloud-save-dialog-title">Save to Cloud</DialogTitle>
    <DialogDescription className="cloud-save-dialog-description">
      Save the current forecast package to your hosted library so it is ready from any signed-in device.
    </DialogDescription>
  </DialogHeader>
);

/** Compact context callout showing the current cloud save label. */
const CloudSaveDialogCallout: React.FC<{ currentLabel: string }> = ({ currentLabel }) => (
  <div className="cloud-save-dialog-callout">
    <div>
      <span>Saving as</span>
      <strong>{currentLabel || 'Untitled Forecast'}</strong>
    </div>
    <div className="cloud-save-dialog-icon">
      <Cloud className="h-5 w-5" />
    </div>
  </div>
);

/** Error banner shown when the current cloud save attempt fails. */
const CloudSaveDialogError: React.FC<{ error: string }> = ({ error }) => (
  <div className="cloud-save-dialog-error">
    <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
    <p>{error}</p>
  </div>
);

/** Footer actions for canceling or confirming the cloud save. */
const CloudSaveDialogFooter: React.FC<{
  isSaving: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
}> = ({ isSaving, canSave, onCancel, onSave }) => (
  <DialogFooter className="cloud-save-dialog-footer">
    <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
      Cancel
    </Button>
    <Button type="button" onClick={onSave} disabled={!canSave || isSaving} className="cloud-save-dialog-primary">
      {isSaving ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
      {isSaving ? 'Saving...' : 'Save to Cloud'}
    </Button>
  </DialogFooter>
);

/** Main content stack for the cloud save dialog. */
const CloudSaveDialogBody: React.FC<{
  currentLabel: string;
  error?: string;
  label: string;
  isSaving: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onLabelChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}> = ({ currentLabel, error, label, isSaving, inputRef, onLabelChange, onCancel, onSave }) => (
  <div className="cloud-save-dialog-body">
    <CloudSaveDialogHeader />
    <CloudSaveDialogCallout currentLabel={currentLabel} />
    {error ? <CloudSaveDialogError error={error} /> : null}

    <div className="cloud-save-dialog-field">
      <label htmlFor="cloud-cycle-name">Cycle name</label>
      <Input
        ref={inputRef as unknown as React.Ref<HTMLInputElement>}
        id="cloud-cycle-name"
        className="cloud-save-dialog-input"
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder="e.g., March 29 - Strong Pattern"
        disabled={isSaving}
      />
    </div>

    <CloudSaveDialogFooter
      isSaving={isSaving}
      canSave={Boolean(label.trim())}
      onCancel={onCancel}
      onSave={onSave}
    />
  </div>
);

/** Creates the local state and event handlers used by the cloud save dialog. */
const useCloudSaveDialogState = (
  open: boolean,
  currentLabel: string,
  onOpenChange: (open: boolean) => void,
  onSave: (label: string) => Promise<boolean>
): CloudSaveDialogState => {
  const [label, setLabel] = useState(currentLabel);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || isSaving) {
      return;
    }

    setLabel(currentLabel);
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [currentLabel, isSaving, open]);

  /** Persists the trimmed cloud label and closes the modal on success. */
  const handleSave = async () => {
    if (!label.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const success = await onSave(label.trim());
      if (success) {
        onOpenChange(false);
        setLabel('');
      }
    } finally {
      setIsSaving(false);
    }
  };

  /** Blocks closing while a save is in progress and resets stale label state on close. */
  const handleOpenChange = (newOpen: boolean) => {
    if (isSaving) {
      return;
    }

    onOpenChange(newOpen);
    if (!newOpen) {
      setLabel('');
    }
  };

  return {
    label,
    isSaving,
    inputRef,
    setLabel,
    handleSave,
    handleOpenChange,
  };
};

/**
 * Modal for saving a forecast to the cloud
 */
export const CloudSaveModal: React.FC<CloudSaveModalProps> = ({
  open,
  onOpenChange,
  onSave,
  currentLabel = '',
  error,
}) => {
  const {
    label,
    isSaving,
    inputRef,
    setLabel,
    handleSave,
    handleOpenChange,
  } = useCloudSaveDialogState(open, currentLabel, onOpenChange, onSave);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="cloud-save-dialog">
        <CloudSaveDialogBody
          currentLabel={currentLabel}
          error={error}
          label={label}
          isSaving={isSaving}
          inputRef={inputRef}
          onLabelChange={setLabel}
          onCancel={() => handleOpenChange(false)}
          onSave={handleSave}
        />
      </DialogContent>
    </Dialog>
  );
};
