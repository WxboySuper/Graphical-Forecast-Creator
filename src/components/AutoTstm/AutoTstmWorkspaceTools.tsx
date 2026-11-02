import React from 'react';
import { CloudLightning } from 'lucide-react';
import { ServerBackedFeatureBoundary } from '../../features/ServerBackedFeatureBoundary';
import { AUTO_TSTM_DISABLED_MESSAGE } from '../../config/autoTstmDisable';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { UseAutoTstmResult } from '../../hooks/useAutoTstm';
import AutoTstmPanel from './AutoTstmPanel';

/** Gated forecast-editor entry point for cached Auto-TSTM preview and apply. */
export const AutoTstmWorkspaceTools: React.FC<{
  autoTstm: UseAutoTstmResult;
}> = ({ autoTstm }) => (
  <ServerBackedFeatureBoundary feature="autoTstm" unavailableMessage={AUTO_TSTM_DISABLED_MESSAGE}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2"
            onClick={autoTstm.openPanel}
            disabled
            title={AUTO_TSTM_DISABLED_MESSAGE}
            aria-label={`Auto-TSTM (disabled): ${AUTO_TSTM_DISABLED_MESSAGE}`}
          >
            <CloudLightning className="h-4 w-4" />
            Auto-TSTM
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{AUTO_TSTM_DISABLED_MESSAGE}</p>
      </TooltipContent>
    </Tooltip>
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

export default AutoTstmWorkspaceTools;
