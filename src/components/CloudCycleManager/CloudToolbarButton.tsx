import React, { useState, useCallback } from 'react';
import { Cloud, FolderOpen, LoaderCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { CloudSaveModal } from './CloudSaveLoadModals';
import type { CloudSyncState } from '../../types/cloudCycles';
import './CloudToolbarButton.css';

interface CloudToolbarButtonProps {
  canSave: boolean;
  premiumActive: boolean;
  isExpiredPremium: boolean;
  currentCycleDate: string;
  currentCloudLabel?: string;
  syncState?: CloudSyncState;
  onSaveToCloud: (label: string) => Promise<void>;
  onOpenCloudLibrary: () => void;
}

/**
 * Toolbar button group for cloud save/load operations.
 */
export const CloudToolbarButton: React.FC<CloudToolbarButtonProps> = ({
  canSave,
  premiumActive,
  isExpiredPremium,
  currentCloudLabel,
  syncState = 'idle',
  onSaveToCloud,
  currentCycleDate,
  onOpenCloudLibrary,
}) => {
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveClick = useCallback(() => {
    if (!canSave) {
      setError(
        premiumActive && isExpiredPremium
          ? 'Your premium subscription has expired. Renew to save forecasts to the cloud.'
          : 'Subscribe to premium to save forecasts to the cloud.'
      );
    }
    setSaveModalOpen(true);
    if (canSave) {
      setError(null);
    }
  }, [canSave, premiumActive, isExpiredPremium]);

  const handleSaveToCloud = useCallback(
    async (label: string) => {
      try {
        setError(null);
        await onSaveToCloud(label);
        setSaveModalOpen(false);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save to cloud';
        setError(message);
        return false;
      }
    },
    [onSaveToCloud]
  );

  const tooltip = canSave
    ? currentCloudLabel
      ? `Save updates to "${currentCloudLabel}"`
      : 'Save this forecast to your cloud library'
    : premiumActive && isExpiredPremium
      ? 'Premium expired. Cloud writes are read-only until you renew.'
      : 'Subscribe to premium to save forecasts to the cloud';

  const saveIcon = syncState === 'saving' ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Cloud className="h-6 w-6" />;

  return (
    <>
      <div className="cloud-toolbar-group">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handleSaveClick}
              disabled={syncState === 'saving'}
              className="cloud-toolbar-action cloud-toolbar-action-save h-14 w-14 lg:h-16 lg:w-16"
            >
              {saveIcon}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onOpenCloudLibrary}
              className="cloud-toolbar-action cloud-toolbar-action-library h-14 w-14 lg:h-16 lg:w-16"
            >
              <FolderOpen className="h-6 w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open the cloud library</TooltipContent>
        </Tooltip>
      </div>

      <CloudSaveModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        onSave={handleSaveToCloud}
        currentLabel={currentCloudLabel || `${currentCycleDate} Forecast`}
        error={error}
      />
    </>
  );
};
