import React, { memo } from 'react';
import { Copy } from 'lucide-react';
import type { ProbabilisticHazardType } from '../../utils/outlookGeometryCopy';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

const hazardLabels: Record<ProbabilisticHazardType, string> = {
  tornado: 'Tornado',
  wind: 'Wind',
  hail: 'Hail',
};

interface OutlookGeometryCopyControlsProps {
  activeHazard: ProbabilisticHazardType;
  activeProbability: string;
  otherHazards: ProbabilisticHazardType[];
  canCopyAllFrom: (sourceType: ProbabilisticHazardType) => boolean;
  canCopyProbabilityFrom: (sourceType: ProbabilisticHazardType) => boolean;
  onCopyAllFrom: (sourceType: ProbabilisticHazardType) => void;
  onCopyProbabilityFrom: (sourceType: ProbabilisticHazardType) => void;
}

export const OutlookGeometryCopyControls: React.FC<OutlookGeometryCopyControlsProps> = memo(({
  activeHazard,
  activeProbability,
  otherHazards,
  canCopyAllFrom,
  canCopyProbabilityFrom,
  onCopyAllFrom,
  onCopyProbabilityFrom,
}) => {
  if (otherHazards.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex min-w-[220px] flex-col gap-2">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Match Geometry
        </label>

        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              All levels
            </span>
            <div className="flex flex-wrap gap-1">
              {otherHazards.map((sourceType) => (
                <Tooltip key={`all-${sourceType}`}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={!canCopyAllFrom(sourceType)}
                      onClick={() => onCopyAllFrom(sourceType)}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      {hazardLabels[sourceType]}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Replace all {hazardLabels[activeHazard]} polygons with geometry from {hazardLabels[sourceType]}.
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {activeProbability} only
            </span>
            <div className="flex flex-wrap gap-1">
              {otherHazards.map((sourceType) => (
                <Tooltip key={`prob-${sourceType}`}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={!canCopyProbabilityFrom(sourceType)}
                      onClick={() => onCopyProbabilityFrom(sourceType)}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      {hazardLabels[sourceType]}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Copy only the {activeProbability} polygon from {hazardLabels[sourceType]} into {hazardLabels[activeHazard]}.
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
});

OutlookGeometryCopyControls.displayName = 'OutlookGeometryCopyControls';

export default OutlookGeometryCopyControls;
