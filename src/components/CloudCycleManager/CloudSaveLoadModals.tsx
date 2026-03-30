import React, { useEffect, useState } from 'react';
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
  isLoading?: boolean;
  error?: string;
}

/**
 * Modal for saving a forecast to the cloud
 */
export const CloudSaveModal: React.FC<CloudSaveModalProps> = ({
  open,
  onOpenChange,
  onSave,
  currentLabel = '',
  isLoading = false,
  error,
}) => {
  const [label, setLabel] = useState(currentLabel);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && !isSaving) {
      setLabel(currentLabel);
    }
  }, [currentLabel, isSaving, open]);

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

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSaving) {
      onOpenChange(newOpen);
      if (!newOpen) {
        setLabel('');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="cloud-save-dialog">
        <div className="cloud-save-dialog-body">
          <DialogHeader className="cloud-save-dialog-header">
            <DialogTitle className="cloud-save-dialog-title">Save to Cloud</DialogTitle>
            <DialogDescription className="cloud-save-dialog-description">
              Save the current forecast package to your hosted library so it is ready from any signed-in device.
            </DialogDescription>
          </DialogHeader>

          <div className="cloud-save-dialog-callout">
            <div>
              <span>Saving as</span>
              <strong>{currentLabel || 'Untitled Forecast'}</strong>
            </div>
            <div className="cloud-save-dialog-icon">
              <Cloud className="h-5 w-5" />
            </div>
          </div>

          {error && (
            <div className="cloud-save-dialog-error">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <div className="cloud-save-dialog-field">
            <label htmlFor="cloud-cycle-name">Cycle name</label>
            <Input
              id="cloud-cycle-name"
              className="cloud-save-dialog-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., March 29 - Strong Pattern"
              disabled={isSaving}
              autoFocus
            />
          </div>

          <DialogFooter className="cloud-save-dialog-footer">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!label.trim() || isSaving} className="cloud-save-dialog-primary">
              {isSaving && <Loader className="w-4 h-4 mr-2 animate-spin" />}
              {isSaving ? 'Saving...' : 'Save to Cloud'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface CloudLoadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (cycleId: string) => Promise<void>;
  cycles: Array<{ id: string; label: string; updatedAt: string; cycleDate: string }>;
  isLoading?: boolean;
  error?: string;
}

/**
 * Modal for loading a forecast from the cloud (deprecated - use CloudLibraryPage instead)
 * Kept for potential inline preview applications
 */
export const CloudLoadModal: React.FC<CloudLoadModalProps> = ({
  open,
  onOpenChange,
  onLoad,
  cycles,
  isLoading = false,
  error,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingCycle, setIsLoadingCycle] = useState(false);

  const handleLoad = async () => {
    if (!selectedId) return;

    setIsLoadingCycle(true);
    try {
      await onLoad(selectedId);
      onOpenChange(false);
      setSelectedId(null);
    } finally {
      setIsLoadingCycle(false);
    }
  };

  const selectedCycle = cycles.find((c) => c.id === selectedId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Load from Cloud</DialogTitle>
          <DialogDescription>
            Select a forecast to load from your cloud library.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : cycles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No cloud cycles saved yet
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {cycles.map((cycle) => (
                <button
                  key={cycle.id}
                  onClick={() => setSelectedId(cycle.id)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                    selectedId === cycle.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="font-medium">{cycle.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cycle.cycleDate} • {new Date(cycle.updatedAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoadingCycle}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleLoad}
            disabled={!selectedCycle || isLoadingCycle}
          >
            {isLoadingCycle && <Loader className="w-4 h-4 mr-2 animate-spin" />}
            {isLoadingCycle ? 'Loading...' : 'Load'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
