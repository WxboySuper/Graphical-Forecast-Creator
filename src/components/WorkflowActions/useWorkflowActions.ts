import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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

/** Encapsulates workflow action state and dispatch logic. */
export function useWorkflowActions() {
  const dispatch = useDispatch();
  const [showStartNewModal, setShowStartNewModal] = useState(false);
  const [showStartFromPreviousModal, setShowStartFromPreviousModal] = useState(false);

  const workflowMetadata = useSelector(selectWorkflowMetadata);
  const workflowTemplate = useSelector(selectWorkflowTemplate);
  const outlookVersionSnapshots = useSelector(selectOutlookVersionSnapshots);
  const currentVersionNumber = useSelector(selectCurrentVersionNumber);

  const isWorkflowMode = isFeatureExposed('forecastWorkflowV2');
  const isInProgress = workflowMetadata?.status === 'in-progress';
  const hasVersionHistory = outlookVersionSnapshots.length > 0 || currentVersionNumber > 1;

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
    if (isInProgress && hasVersionHistory) {
      dispatch(createOutlookUpdate());
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

  return {
    isWorkflowMode,
    isInProgress,
    hasVersionHistory,
    currentVersionNumber,
    workflowMetadata,
    workflowTemplate,
    showStartNewModal,
    setShowStartNewModal,
    showStartFromPreviousModal,
    setShowStartFromPreviousModal,
    handleStartBlank,
    handleCreateUpdate,
    handleStartFromPrevious,
  };
}
