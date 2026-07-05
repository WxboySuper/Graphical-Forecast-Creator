import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Workflow,
  Play,
  RotateCcw,
  RefreshCw,
  GitBranch,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { isFeatureExposed } from '../../config/featureExposure';
import { 
  startBlankCycle, 
  createOutlookUpdate,
  startFromPreviousCycle,
  selectWorkflowMetadata,
  selectWorkflowTemplate,
  selectOutlookVersionSnapshots,
  selectCurrentVersionNumber,
} from '../../store/forecastSlice';
import type { WorkflowMetadata } from '../../types/workflow';
import { DEFAULT_WORKFLOW_TEMPLATES } from './workflowTemplates';

interface WorkflowActionsProps {
  className?: string;
}

/** Modal for selecting a workflow template when starting a new cycle. */
const StartNewWorkflowModal: React.FC<{
  templates: WorkflowMetadata[];
  onSelect: (template?: WorkflowMetadata) => void;
  onClose: () => void;
}> = ({ templates, onSelect, onClose }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowMetadata | null>(null);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Start New Workflow</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Select a workflow template for your new forecast cycle.
        </p>
        
        <div className="space-y-2">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => setSelectedTemplate(template)}
              className={cn(
                'w-full text-left p-3 rounded-lg border transition-colors',
                selectedTemplate?.id === template.id
                  ? 'border-violet-500 bg-violet-500/10'
                  : 'border-border hover:border-violet-300'
              )}
            >
              <div className="font-medium">{template.label}</div>
              <div className="text-xs text-muted-foreground">
                Groupings: {template.groupings.join(', ')}
              </div>
            </button>
          ))}
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSelect(selectedTemplate || undefined)}>
            Start Cycle
          </Button>
        </div>
      </div>
    </div>
  );
};

/** Modal for selecting a previous cycle to base a new cycle on. */
const StartFromPreviousModal: React.FC<{
  onSelect: (sourceCycleId: string) => void;
  onClose: () => void;
}> = ({ onClose }) => {
  // This is a placeholder - in a real implementation, this would show
  // a list of saved cycles from the cycle history
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg p-6 w-96">
        <h2 className="text-lg font-semibold mb-4">Start from Previous Cycle</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Select a previous cycle to use as a base for your new forecast.
        </p>
        
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Cycle history integration coming soon.</p>
          <p className="text-xs mt-1">
            Use the History action to load a previous cycle, then create an update.
          </p>
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled>
            Select Cycle
          </Button>
        </div>
      </div>
    </div>
  );
};

/** Workflow actions dropdown menu for the forecast editor toolbar. */
export const WorkflowActions: React.FC<WorkflowActionsProps> = () => {
  const dispatch = useDispatch();
  const [showStartNewModal, setShowStartNewModal] = useState(false);
  const [showStartFromPreviousModal, setShowStartFromPreviousModal] = useState(false);
  
  const workflowMetadata = useSelector(selectWorkflowMetadata);
  const workflowTemplate = useSelector(selectWorkflowTemplate);
  const outlookVersionSnapshots = useSelector(selectOutlookVersionSnapshots);
  const currentVersionNumber = useSelector(selectCurrentVersionNumber);
  
  const isWorkflowMode = isFeatureExposed('forecastWorkflowV2');
  const isInProgress = workflowMetadata?.status === 'in-progress';
  const hasOutlookData = outlookVersionSnapshots.length > 0 || currentVersionNumber > 1;
  
  if (!isWorkflowMode) {
    return null;
  }
  
  /** Handle starting a blank cycle with optional workflow template. */
  const handleStartBlank = (template?: WorkflowMetadata) => {
    dispatch(startBlankCycle({ 
      workflowTemplate: template,
      cycleDate: new Date().toISOString().split('T')[0],
    }));
    setShowStartNewModal(false);
  };
  
  /** Handle creating a new outlook version within the current cycle. */
  const handleCreateUpdate = () => {
    if (isInProgress && hasOutlookData) {
      dispatch(createOutlookUpdate({}));
    }
  };
  
  /** Handle starting a new cycle derived from a previous cycle. */
  const handleStartFromPrevious = (sourceCycleId: string) => {
    dispatch(startFromPreviousCycle({
      sourceCycleId,
      workflowTemplate: workflowTemplate || undefined,
    }));
    setShowStartFromPreviousModal(false);
  };
  
  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'tabbed-integrated-toolbar__action-tile h-10 shrink-0 justify-start rounded-xl px-2.5 text-left text-xs',
                  'bg-background',
                  'tabbed-integrated-toolbar__action-tile--primary'
                )}
              >
                <span className="tabbed-integrated-toolbar__action-icon rounded-lg p-1.5 bg-violet-500/15 text-violet-700">
                  <Workflow className="h-4 w-4" />
                </span>
                <span className="font-semibold">Workflow</span>
                <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Workflow actions for cycle management</p>
          </TooltipContent>
        </Tooltip>
        
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Workflow Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => setShowStartNewModal(true)}>
            <Play className="h-4 w-4 mr-2" />
            <div>
              <div className="font-medium">Start Blank</div>
              <div className="text-xs text-muted-foreground">Begin a new empty cycle</div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => {}}>
            <RotateCcw className="h-4 w-4 mr-2" />
            <div>
              <div className="font-medium">Continue Incomplete</div>
              <div className="text-xs text-muted-foreground">Resume a saved cycle</div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={handleCreateUpdate}
            disabled={!isInProgress || !hasOutlookData}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            <div>
              <div className="font-medium">Create Update</div>
              <div className="text-xs text-muted-foreground">
                New outlook version (v{currentVersionNumber + 1})
              </div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => setShowStartFromPreviousModal(true)}>
            <GitBranch className="h-4 w-4 mr-2" />
            <div>
              <div className="font-medium">Start from Previous</div>
              <div className="text-xs text-muted-foreground">Base on an existing cycle</div>
            </div>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Current: {workflowTemplate?.label || 'No workflow'} 
            {workflowMetadata && ` • v${currentVersionNumber}`}
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Start New Modal */}
      {showStartNewModal && (
        <StartNewWorkflowModal
          templates={DEFAULT_WORKFLOW_TEMPLATES}
          onSelect={handleStartBlank}
          onClose={() => setShowStartNewModal(false)}
        />
      )}
      
      {/* Start from Previous Modal */}
      {showStartFromPreviousModal && (
        <StartFromPreviousModal
          onSelect={handleStartFromPrevious}
          onClose={() => setShowStartFromPreviousModal(false)}
        />
      )}
    </>
  );
};

export default WorkflowActions;
