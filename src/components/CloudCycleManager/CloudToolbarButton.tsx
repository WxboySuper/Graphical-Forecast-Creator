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
    ? <LoaderCircle className="h-6 w-6 animate-spin" />
    : <Cloud className="h-6 w-6" />;

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

/** Shared tooltip-wrapped toolbar button used by the cloud actions. */
const CloudToolbarActionButton: React.FC<{
  tooltip: string;
  ariaLabel: string;
  className: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ tooltip, ariaLabel, className, disabled = false, onClick, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        aria-label={ariaLabel}
        title={ariaLabel}
        variant="outline"
        size="icon"
        onClick={onClick}
        disabled={disabled}
        className={className}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>
);

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
      <div className="cloud-toolbar-group">
        <CloudToolbarActionButton
          tooltip={tooltip}
          ariaLabel="Save forecast to cloud"
          disabled={syncState === 'saving'}
          onClick={handleSaveClick}
          className="cloud-toolbar-action h-14 w-14 lg:h-16 lg:w-16 bg-green-500/20 hover:bg-green-500/30 border-green-500/50 text-green-700 dark:!bg-green-500/20 dark:hover:!bg-green-500/30 dark:border-green-500/50 dark:text-green-400"
        >
          {saveIcon}
        </CloudToolbarActionButton>

        <CloudToolbarActionButton
          tooltip="Open the cloud library"
          ariaLabel="Open cloud library"
          onClick={onOpenCloudLibrary}
          className="cloud-toolbar-action h-14 w-14 lg:h-16 lg:w-16 bg-violet-500/20 hover:bg-violet-500/30 border-violet-500/50 text-violet-700 dark:!bg-violet-500/20 dark:hover:!bg-violet-500/30 dark:border-violet-500/50 dark:text-violet-400"
        >
          <FolderOpen className="h-6 w-6" />
        </CloudToolbarActionButton>
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
