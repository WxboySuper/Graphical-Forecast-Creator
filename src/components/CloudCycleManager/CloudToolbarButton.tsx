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

/** Returns the cloud-save error shown when the user clicks save without write access. */
const getCloudToolbarSaveError = (premiumActive: boolean, isExpiredPremium: boolean): string =>
  premiumActive && isExpiredPremium
    ? 'Your premium subscription has expired. Renew to save forecasts to the cloud.'
    : 'Subscribe to premium to save forecasts to the cloud.';

/** Returns the save-button tooltip for the current cloud save state. */
const getCloudToolbarTooltip = (
  canSave: boolean,
  premiumActive: boolean,
  isExpiredPremium: boolean,
  currentCloudLabel?: string
): string => {
  if (!canSave) {
    return premiumActive && isExpiredPremium
      ? 'Premium expired. Cloud writes are read-only until you renew.'
      : 'Subscribe to premium to save forecasts to the cloud';
  }

  return currentCloudLabel
    ? `Save updates to "${currentCloudLabel}"`
    : 'Save this forecast to your cloud library';
};

/** Returns the correct icon for the cloud save button based on the current sync state. */
const renderCloudSaveIcon = (syncState: CloudSyncState) =>
  syncState === 'saving'
    ? <LoaderCircle className="h-4 w-4 animate-spin" />
    : <Cloud className="h-4 w-4" />;

/** Manages cloud save modal state and save errors for the toolbar button group. */
const useCloudToolbarState = ({
  canSave,
  premiumActive,
  isExpiredPremium,
  onSaveToCloud,
}: Pick<CloudToolbarButtonProps, 'canSave' | 'premiumActive' | 'isExpiredPremium' | 'onSaveToCloud'>) => {
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveClick = useCallback(() => {
    setSaveModalOpen(true);
    setError(canSave ? null : getCloudToolbarSaveError(premiumActive, isExpiredPremium));
  }, [canSave, isExpiredPremium, premiumActive]);

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

  return {
    saveModalOpen,
    error,
    handleSaveClick,
    handleSaveToCloud,
    setSaveModalOpen,
  };
};



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
  const {
    saveModalOpen,
    error,
    handleSaveClick,
    handleSaveToCloud,
    setSaveModalOpen,
  } = useCloudToolbarState({
    canSave,
    premiumActive,
    isExpiredPremium,
    onSaveToCloud,
  });

  const tooltip = getCloudToolbarTooltip(canSave, premiumActive, isExpiredPremium, currentCloudLabel);
  const saveIcon = renderCloudSaveIcon(syncState);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              aria-label="Save forecast to cloud"
              title="Save forecast to cloud"
              disabled={syncState === 'saving'}
              onClick={handleSaveClick}
              className="tabbed-integrated-toolbar__action-tile h-10 shrink-0 justify-start rounded-xl px-2.5 text-left text-xs bg-background tabbed-integrated-toolbar__action-tile--primary"
            >
              <span className="tabbed-integrated-toolbar__action-icon rounded-lg p-1.5 bg-green-500/15 text-green-700">
                {saveIcon}
              </span>
              <span className="font-semibold">Save to Cloud</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              aria-label="Open cloud library"
              title="Open cloud library"
              onClick={onOpenCloudLibrary}
              className="tabbed-integrated-toolbar__action-tile h-10 shrink-0 justify-start rounded-xl px-2.5 text-left text-xs bg-background tabbed-integrated-toolbar__action-tile--utility"
            >
              <span className="tabbed-integrated-toolbar__action-icon rounded-lg p-1.5 bg-blue-500/15 text-blue-700">
                <FolderOpen className="h-4 w-4" />
              </span>
              <span className="font-semibold">Open Cloud</span>
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
        error={error ?? undefined}
      />
    </>
  );
};
