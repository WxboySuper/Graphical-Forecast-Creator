/**
 * Auto-TSTM workspace entry point. Applies the server-backed feature gate and
 * exposes the cached preview/apply panel from the forecast editor toolbar.
 */
import React from 'react';
import { CloudLightning } from 'lucide-react';
import { ServerBackedFeatureBoundary } from '../../features/ServerBackedFeatureBoundary';
import { AUTO_TSTM_DISABLED, AUTO_TSTM_DISABLED_MESSAGE } from '../../config/autoTstmDisable';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { UseAutoTstmResult } from '../../hooks/useAutoTstm';
import AutoTstmPanel from './AutoTstmPanel';

/** Gated forecast-editor entry point for cached Auto-TSTM preview and apply. */
export const AutoTstmWorkspaceTools: React.FC<{
  autoTstm: UseAutoTstmResult;
}> = ({ autoTstm }) => {
  const disabledReason = AUTO_TSTM_DISABLED
    ? AUTO_TSTM_DISABLED_MESSAGE
    : !autoTstm.isDaySupported
      ? 'Auto-TSTM is unavailable for this forecast day.'
      : undefined;
  const isDisabled = Boolean(disabledReason);
  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-2"
      onClick={autoTstm.openPanel}
      disabled={isDisabled}
      aria-label={isDisabled ? `Auto-TSTM (disabled): ${disabledReason}` : 'Auto-TSTM'}
    >
      <CloudLightning className="h-4 w-4" />
      Auto-TSTM
    </Button>
  );

  return (
    <ServerBackedFeatureBoundary feature="autoTstm" unavailableMessage={AUTO_TSTM_DISABLED_MESSAGE}>
      {disabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="group"
              tabIndex={0}
              aria-label={`Auto-TSTM unavailable: ${disabledReason}`}
              className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      ) : button}
      <AutoTstmPanel
        open={autoTstm.isPanelOpen}
        status={autoTstm.status}
        previewResponse={autoTstm.previewResponse}
        errorMessage={autoTstm.errorMessage}
        onClose={autoTstm.closePanel}
        onRetry={() => {
          autoTstm.fetchPreview().catch(() => undefined);
        }}
        onApply={autoTstm.applyPreview}
        onCancel={autoTstm.cancelPreview}
      />
    </ServerBackedFeatureBoundary>
  );
};

export default AutoTstmWorkspaceTools;