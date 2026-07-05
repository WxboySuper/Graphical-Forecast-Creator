import React from 'react';
import {
  Workflow,
  Play,
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
import { cn } from '../../lib/utils';
import type { WorkflowMetadata } from '../../types/workflow';
import { DEFAULT_WORKFLOW_TEMPLATES } from './workflowTemplates';
import { useWorkflowActions } from './useWorkflowActions';

interface WorkflowActionsProps {
  className?: string;
}

/** Modal for selecting a workflow template when starting a new cycle. */
const StartNewWorkflowModal: React.FC<{
  templates: WorkflowMetadata[];
  onSelect: (template?: WorkflowMetadata) => void;
  onClose: () => void;
}> = ({ templates, onSelect, onClose }) => {
  const [selectedTemplate, setSelectedTemplate] = React.useState<WorkflowMetadata | null>(null);
  
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
}> = ({ onClose }) => (
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

/** Trigger button for the workflow actions dropdown. */
const WorkflowActionsTrigger: React.FC = () => (
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
);

/** Renders the workflow dropdown menu body. */
const WorkflowMenuContent: React.FC<{
  isInProgress: boolean;
  hasVersionHistory: boolean;
  currentVersionNumber: number;
  workflowTemplate: WorkflowMetadata | null | undefined;
  workflowMetadata: { status: string } | undefined;
  onStartBlank: () => void;
  onCreateUpdate: () => void;
  onStartFromPrevious: () => void;
}> = ({
  isInProgress,
  hasVersionHistory,
  currentVersionNumber,
  workflowTemplate,
  workflowMetadata,
  onStartBlank,
  onCreateUpdate,
  onStartFromPrevious,
}) => (
  <DropdownMenuContent align="end" className="w-56">
    <DropdownMenuLabel>Workflow Actions</DropdownMenuLabel>
    <DropdownMenuSeparator />
    
    <DropdownMenuItem onClick={onStartBlank}>
      <Play className="h-4 w-4 mr-2" />
      <span className="font-medium">Start Blank</span>
    </DropdownMenuItem>
    
    <DropdownMenuSeparator />
    
    <DropdownMenuItem 
      onClick={onCreateUpdate}
      disabled={!isInProgress || !hasVersionHistory}
    >
      <RefreshCw className="h-4 w-4 mr-2" />
      <span className="font-medium">Create Update (v{currentVersionNumber + 1})</span>
    </DropdownMenuItem>
    
    <DropdownMenuItem onClick={onStartFromPrevious}>
      <GitBranch className="h-4 w-4 mr-2" />
      <span className="font-medium">Start from Previous</span>
    </DropdownMenuItem>
    
    <DropdownMenuSeparator />
    
    <DropdownMenuLabel className="text-xs text-muted-foreground">
      Current: {workflowTemplate?.label ?? 'No workflow'} 
      {workflowMetadata != null && ` • v${currentVersionNumber}`}
    </DropdownMenuLabel>
  </DropdownMenuContent>
);

/** Workflow actions dropdown menu for the forecast editor toolbar. */
export const WorkflowActions: React.FC<WorkflowActionsProps> = () => {
  const actions = useWorkflowActions();

  if (!actions.isWorkflowMode) {
    return null;
  }

  return (
    <DropdownMenu>
      <WorkflowActionsTrigger />
      
      <WorkflowMenuContent
        isInProgress={actions.isInProgress}
        hasVersionHistory={actions.hasVersionHistory}
        currentVersionNumber={actions.currentVersionNumber}
        workflowTemplate={actions.workflowTemplate}
        workflowMetadata={actions.workflowMetadata}
        onStartBlank={() => actions.setShowStartNewModal(true)}
        onCreateUpdate={actions.handleCreateUpdate}
        onStartFromPrevious={() => actions.setShowStartFromPreviousModal(true)}
      />
      
      {actions.showStartNewModal && (
        <StartNewWorkflowModal
          templates={DEFAULT_WORKFLOW_TEMPLATES}
          onSelect={actions.handleStartBlank}
          onClose={() => actions.setShowStartNewModal(false)}
        />
      )}
      
      {actions.showStartFromPreviousModal && (
        <StartFromPreviousModal
          onSelect={actions.handleStartFromPrevious}
          onClose={() => actions.setShowStartFromPreviousModal(false)}
        />
      )}
    </DropdownMenu>
  );
};

export default WorkflowActions;
