import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Archive, CheckCircle2, Clock3, FileText, GitBranch, Map, RefreshCw } from 'lucide-react';
import { isFeatureExposed } from '../../config/featureExposure';
import { Button } from '../ui/button';
import {
  selectForecastCycle,
  selectSavedCycles,
  selectHasActiveWorkflow,
  selectWorkflowMetadata,
  selectWorkflowTemplate,
  selectCompletionValidationResult,
  selectOmittedDays,
  createOutlookUpdate,
  startFromPreviousCycle,
  validateCompletion,
  completeCycle,
  completeWithOmissions,
  dismissCompletionModal,
  omitDay,
} from '../../store/forecastSlice';
import { getLocalCalendarDate } from '../../utils/localDate';
import { validateCycleCompletion } from '../../utils/completionValidation';
import { downloadGfcPackage } from '../../utils/fileUtils';
import type { DayType } from '../../types/outlooks';
import type { StandardGrouping } from '../../types/workflow';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import CompletionValidationModal from '../CompletionValidation/CompletionValidationModal';
import './ForecastWorkflowPanel.css';

interface ForecastWorkflowPanelProps {
  controller?: ForecastWorkspaceController;
  context?: 'forecast' | 'discussion';
}

interface PreviousOutlookSuggestion {
  cycleId: string;
  label: string;
  sourceDay: DayType;
  targetDay: DayType;
}

/** True when one forecast day has any drawn outlook or low-probability marker. */
const dayHasMapWork = (day: NonNullable<ReturnType<typeof selectForecastCycle>['days'][DayType]>): boolean => {
  const hasMapData = Object.values(day.data).some((outlookMap) => (outlookMap?.size ?? 0) > 0);
  const hasLowProbability = (day.metadata.lowProbabilityOutlooks?.length ?? 0) > 0;
  return hasMapData || hasLowProbability;
};

/** True when one forecast day has any map or discussion work started. */
const dayHasPackageWork = (day: NonNullable<ReturnType<typeof selectForecastCycle>['days'][DayType]>): boolean => {
  return dayHasMapWork(day) || Boolean(day.discussion);
};

/** Returns true when a discussion contains user-authored content. */
const hasDiscussionContent = (discussion: NonNullable<ReturnType<typeof selectForecastCycle>['days'][DayType]>['discussion']): boolean => {
  if (!discussion) return false;
  if (discussion.mode === 'diy') {
    return Boolean(discussion.diyContent?.trim());
  }
  const guidedContent = discussion.guidedContent;
  return Boolean(guidedContent && Object.values(guidedContent).some((value) => value.trim().length > 0));
};

/** Returns yesterday's local calendar date as YYYY-MM-DD. */
const getYesterdayLocalDate = (): string => {
  const today = new Date(`${getLocalCalendarDate()}T00:00:00`);
  today.setDate(today.getDate() - 1);
  return today.toISOString().slice(0, 10);
};

/** Maps yesterday's forecast day to the current day's useful starting point. */
const getPreviousSourceDay = (targetDay: DayType): DayType | null => {
  if (targetDay >= 1 && targetDay <= 7) {
    return (targetDay + 1) as DayType;
  }
  return null;
};

const formatCycleDate = (cycleDate: string): string => {
  const parsed = new Date(`${cycleDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return cycleDate;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Returns the standard groupings that should be validated for a workflow template. */
const getWorkflowValidationGroupings = (
  template: ReturnType<typeof selectWorkflowTemplate>,
): StandardGrouping[] | undefined => {
  const groupings = (template?.groupings ?? []).filter(
    (grouping): grouping is StandardGrouping =>
      grouping === 'day1' || grouping === 'day2' || grouping === 'day3' || grouping === 'day4-8',
  );
  return groupings.length > 0 ? groupings : undefined;
};

/** Finds the most relevant previous outlook for the active forecast day. */
const usePreviousOutlookSuggestion = (): PreviousOutlookSuggestion | null => {
  const forecastCycle = useSelector(selectForecastCycle);
  const savedCycles = useSelector(selectSavedCycles);

  return useMemo(() => {
    const sourceDay = getPreviousSourceDay(forecastCycle.currentDay);
    if (!sourceDay) return null;

    const yesterday = getYesterdayLocalDate();
    const candidate = savedCycles
      .slice()
      .reverse()
      .find((cycle) => {
        const source = cycle.forecastCycle.days[sourceDay];
        return cycle.cycleDate === yesterday && source && dayHasPackageWork(source);
      });

    if (!candidate) return null;

    return {
      cycleId: candidate.id,
      label: `${formatCycleDate(candidate.cycleDate)} Day ${sourceDay}`,
      sourceDay,
      targetDay: forecastCycle.currentDay,
    };
  }, [forecastCycle.currentDay, savedCycles]);
};

const WorkflowStep: React.FC<{
  icon: React.ReactNode;
  label: string;
  status: 'complete' | 'active' | 'pending';
}> = ({ icon, label, status }) => (
  <div className={`forecast-workflow-step forecast-workflow-step--${status}`}>
    <span>{icon}</span>
    <strong>{label}</strong>
  </div>
);

interface WorkflowPanelActionsProps {
  context: 'forecast' | 'discussion';
  isReviewed: boolean;
  canReviewPackage: boolean;
  isUpdating: boolean;
  mapIsComplete: boolean;
  canExportPackage: boolean;
  hasController: boolean;
  hasSameDayWork: boolean;
  isPackageDownloading: boolean;
  previousSuggestion: PreviousOutlookSuggestion | null;
  activeUpdateVersion: number | undefined;
  onExport: () => void;
  onOpenReview: () => void;
  onCreateUpdate: () => void;
  onStartFromPrevious: () => void;
  onNavigate: (path: string) => void;
}

const WorkflowPanelExtras: React.FC<WorkflowPanelActionsProps> = ({
  canExportPackage,
  hasController,
  hasSameDayWork,
  isPackageDownloading,
  isReviewed,
  isUpdating,
  previousSuggestion,
  onCreateUpdate,
  onExport,
  onNavigate,
  onOpenReview,
  onStartFromPrevious,
}) => (
  <>
    {canExportPackage && !isReviewed ? (
      <Button size="sm" variant="outline" onClick={onExport} disabled={isPackageDownloading}>
        <Archive className="h-4 w-4 mr-2" />
        Export
      </Button>
    ) : null}
    {hasController && !isUpdating && (!canReviewPackage || isReviewed) ? (
      <Button size="sm" variant="outline" onClick={onOpenReview}>
        <CheckCircle2 className="h-4 w-4 mr-2" />
        Review
      </Button>
    ) : null}
    {!isUpdating && hasSameDayWork ? (
      <Button size="sm" variant="outline" onClick={onCreateUpdate}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Update
      </Button>
    ) : null}
    {previousSuggestion ? (
      <Button size="sm" variant="outline" onClick={onStartFromPrevious}>
        <GitBranch className="h-4 w-4 mr-2" />
        Use {previousSuggestion.label}
      </Button>
    ) : null}
  </>
);

/** Renders the primary action for the current workflow state. */
const WorkflowPanelPrimaryAction: React.FC<WorkflowPanelActionsProps> = ({
  context,
  isReviewed,
  canReviewPackage,
  isUpdating,
  mapIsComplete,
  isPackageDownloading,
  activeUpdateVersion,
  onExport,
  onOpenReview,
  onNavigate,
}) => {
  if (isReviewed) {
    return (
      <Button size="sm" onClick={onExport} disabled={isPackageDownloading}>
        <Archive className="h-4 w-4 mr-2" />
        {isPackageDownloading ? 'Exporting...' : 'Export Workflow'}
      </Button>
    );
  }
  if (canReviewPackage) {
    return (
      <Button size="sm" onClick={onOpenReview}>
        <CheckCircle2 className="h-4 w-4 mr-2" />
        Review Package
      </Button>
    );
  }
  if (isUpdating) {
    return (
      <>
        {context === 'forecast' ? (
          <Button size="sm" onClick={() => onNavigate('/discussion')} disabled={!mapIsComplete}>
            <FileText className="h-4 w-4 mr-2" />
            Update Discussion
          </Button>
        ) : (
          <Button size="sm" onClick={() => onNavigate('/forecast')}>
            <Map className="h-4 w-4 mr-2" />
            Update Map
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onOpenReview}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Mark Ready
        </Button>
      </>
    );
  }
  if (context === 'discussion') {
    return (
      <Button size="sm" onClick={() => onNavigate('/forecast')}>
        <Map className="h-4 w-4 mr-2" />
        {mapIsComplete ? 'Finish Map' : 'Continue Map'}
      </Button>
    );
  }
  return (
    <Button size="sm" onClick={() => onNavigate('/discussion')} disabled={!mapIsComplete}>
      <FileText className="h-4 w-4 mr-2" />
      Write Discussion
    </Button>
  );
};

/** Renders navigation and export controls beside the primary workflow action. */
const WorkflowPanelActions: React.FC<WorkflowPanelActionsProps> = (props) => (
  <div className="forecast-workflow-panel__actions">
    <WorkflowPanelPrimaryAction {...props} />
    <WorkflowPanelExtras {...props} />
  </div>
);

/** Returns the concise status shown in the workflow banner. */
const getWorkflowStatusLabel = (
  hasMapStarted: boolean,
  isUpdating: boolean,
  activeUpdateVersion: number | undefined,
  mapIsComplete: boolean,
  discussionIsComplete: boolean,
  isReviewed: boolean,
): string => {
  if (!hasMapStarted) return 'Map not started';
  if (isUpdating) return `Update v${activeUpdateVersion} in progress`;
  if (!mapIsComplete) return 'Map in progress';
  if (!discussionIsComplete) return 'Discussion needed';
  return isReviewed ? 'Ready to export' : 'Ready for review';
};

/** Persistent package workflow prompt for the forecast editor. */
export const ForecastWorkflowPanel: React.FC<ForecastWorkflowPanelProps> = ({ controller, context = 'forecast' }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [isPackageDownloading, setIsPackageDownloading] = useState(false);
  const forecastCycle = useSelector(selectForecastCycle);
  const hasActiveWorkflow = useSelector(selectHasActiveWorkflow);
  const workflowMetadata = useSelector(selectWorkflowMetadata);
  const workflowTemplate = useSelector(selectWorkflowTemplate);
  const validationResult = useSelector(selectCompletionValidationResult);
  const omittedDays = useSelector(selectOmittedDays);
  const previousSuggestion = usePreviousOutlookSuggestion();

  if (!isFeatureExposed('forecastWorkflowV2') || !hasActiveWorkflow || !workflowMetadata) {
    return null;
  }

  const currentDay = forecastCycle.days[forecastCycle.currentDay];
  const hasMapStarted = currentDay ? dayHasMapWork(currentDay) : false;
  const hasDiscussion = hasDiscussionContent(currentDay?.discussion);
  const currentValidation = validateCycleCompletion(forecastCycle, getWorkflowValidationGroupings(workflowTemplate));
  const mapIsComplete = !currentValidation.issues.some((issue) => issue.type === 'missing-polygon');
  const discussionIsComplete = !currentValidation.issues.some((issue) => issue.type === 'missing-discussion');
  const activeUpdateVersion = forecastCycle.updateInProgressVersion;
  const isUpdating = typeof activeUpdateVersion === 'number';
  const canReviewPackage = mapIsComplete && discussionIsComplete && !isUpdating && (Boolean(controller) || context === 'discussion');
  const canExportPackage = hasMapStarted || hasDiscussion || workflowMetadata.outlookVersions.length > 0;
  const isReviewed = Boolean(forecastCycle.completionAcknowledgedAt);
  const hasSameDayWork = forecastCycle.cycleDate === getLocalCalendarDate() && Boolean(currentDay && dayHasPackageWork(currentDay));
  const currentVersion = workflowMetadata.outlookVersions.length > 0
    ? Math.max(...workflowMetadata.outlookVersions.map((version) => version.version))
    : 1;

  const statusLabel = getWorkflowStatusLabel(
    hasMapStarted,
    isUpdating,
    activeUpdateVersion,
    mapIsComplete,
    discussionIsComplete,
    isReviewed,
  );

  const handleCreateUpdate = () => {
    dispatch(createOutlookUpdate());
  };
  const handleOpenReview = () => {
    if (controller) {
      controller.onOpenCompletionModal();
      return;
    }
    dispatch(validateCompletion());
  };
  const handleCloseReview = () => dispatch(dismissCompletionModal());
  const handleCompleteReview = () => dispatch(completeCycle());
  const handleCompleteWithOmissions = () => dispatch(completeWithOmissions());
  const handleOmitDay = (day: DayType, reason: string) => dispatch(omitDay({ day, reason }));
  const handleWorkflowExport = async () => {
    setIsPackageDownloading(true);
    try {
      await downloadGfcPackage(
        forecastCycle,
        { center: [39.8283, -98.5795], zoom: 4 },
        workflowMetadata,
      );
    } finally {
      setIsPackageDownloading(false);
    }
  };
  /** Starts today's workflow from the suggested previous-cycle outlook. */
  const handleStartFromPrevious = () => {
    if (!previousSuggestion) return;
    dispatch(startFromPreviousCycle({
      sourceCycleId: previousSuggestion.cycleId,
      sourceDay: previousSuggestion.sourceDay,
      targetDay: previousSuggestion.targetDay,
      newCycleDate: getLocalCalendarDate(),
    }));
  };

  return (
    <section
      className={`forecast-workflow-panel${isUpdating ? ' forecast-workflow-panel--updating' : ''}`}
      aria-label="Forecast package workflow"
    >
      <div className="forecast-workflow-panel__content">
        <div className="forecast-workflow-panel__meta-row">
          <span>Day {forecastCycle.currentDay} package</span>
          <span>{formatCycleDate(forecastCycle.cycleDate)}</span>
          <span>v{currentVersion}</span>
          <strong>{statusLabel}</strong>
          {isUpdating ? (
            <span className="forecast-workflow-panel__update-badge">
              <RefreshCw className="h-3.5 w-3.5" />
              Editing update
            </span>
          ) : null}
        </div>

        <div className="forecast-workflow-panel__steps">
          <WorkflowStep icon={<Map className="h-4 w-4" />} label="Outlook map" status={mapIsComplete ? 'complete' : hasMapStarted ? 'active' : 'pending'} />
          <WorkflowStep icon={<FileText className="h-4 w-4" />} label="Discussion" status={discussionIsComplete ? 'complete' : mapIsComplete ? 'active' : 'pending'} />
          <WorkflowStep icon={<CheckCircle2 className="h-4 w-4" />} label={isUpdating ? `Update v${activeUpdateVersion}` : 'Review'} status={isReviewed ? 'complete' : (canReviewPackage || isUpdating) ? 'active' : 'pending'} />
        </div>
        <WorkflowPanelActions
          context={context}
          isReviewed={isReviewed}
          canReviewPackage={canReviewPackage}
          isUpdating={isUpdating}
          mapIsComplete={mapIsComplete}
          canExportPackage={canExportPackage}
          hasController={Boolean(controller)}
          hasSameDayWork={hasSameDayWork}
          isPackageDownloading={isPackageDownloading}
          previousSuggestion={previousSuggestion}
          activeUpdateVersion={activeUpdateVersion}
          onExport={() => { handleWorkflowExport().catch(() => undefined); }}
          onOpenReview={handleOpenReview}
          onCreateUpdate={handleCreateUpdate}
          onStartFromPrevious={handleStartFromPrevious}
          onNavigate={navigate}
        />
      </div>

      {forecastCycle.cycleDate !== getLocalCalendarDate() ? (
        <div className="forecast-workflow-panel__notice">
          <Clock3 className="h-4 w-4" />
          This forecast was created before today and may now be out of date.
        </div>
      ) : null}
      {!controller ? (
        <CompletionValidationModal
          isOpen={Boolean(validationResult)}
          validationResult={validationResult}
          omittedDays={omittedDays}
          onClose={handleCloseReview}
          onComplete={handleCompleteReview}
          onCompleteWithOmissions={handleCompleteWithOmissions}
          onOmitDay={handleOmitDay}
          onNavigateToIssue={() => navigate('/forecast')}
          onExport={() => { handleWorkflowExport().catch(() => undefined); }}
        />
      ) : null}
    </section>
  );
};

export default ForecastWorkflowPanel;
