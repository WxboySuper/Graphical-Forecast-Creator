import React, { useCallback } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { CycleValidationResult } from '../../types/workflow';
import type { DayType } from '../../types/outlooks';
import { MissingItemsList } from './MissingItemsList';
import './CompletionValidationModal.css';

interface CompletionValidationModalProps {
  isOpen: boolean;
  validationResult: CycleValidationResult | null;
  onClose: () => void;
  onComplete: () => void;
  onCompleteWithOmissions: () => void;
  onNavigateToIssue?: (day: DayType) => void;
}

const getGroupingDay = (grouping: string): DayType | null => {
  switch (grouping) {
    case 'day1': return 1;
    case 'day2': return 2;
    case 'day3': return 3;
    // day4-8 maps to day 4 by default
    case 'day4-8': return 4;
    default: return null;
  }
};

export const CompletionValidationModal: React.FC<CompletionValidationModalProps> = ({
  isOpen,
  validationResult,
  onClose,
  onComplete,
  onCompleteWithOmissions,
  onNavigateToIssue,
}) => {
  const handleNavigate = useCallback(
    (grouping: string) => {
      if (!onNavigateToIssue) return;
      const day = getGroupingDay(grouping);
      if (day) {
        onNavigateToIssue(day);
      }
    },
    [onNavigateToIssue]
  );

  if (!isOpen || !validationResult) return null;

  const { isComplete, issues, missingGroupings } = issuesSummary(validationResult);
  const criticalIssues = issues.filter((i) => i.severity === 'critical');
  const warningIssues = issues.filter((i) => i.severity === 'warning');

  return (
    <div className="completion-modal-root">
      <div className="completion-modal-overlay" onClick={onClose} />
      <div className="completion-modal" role="dialog" aria-modal="true" aria-labelledby="completion-title">
        <div className="completion-modal-header">
          <h2 id="completion-title">Complete Forecast Cycle</h2>
          <button
            type="button"
            className="completion-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="completion-modal-body">
          {isComplete ? (
            <div className="completion-status-badge completion-status-badge--complete">
              <CheckCircle2 className="h-4 w-4" />
              <span>Forecast cycle is complete</span>
            </div>
          ) : (
            <div className="completion-status-badge completion-status-badge--incomplete">
              <AlertTriangle className="h-4 w-4" />
              <span>{criticalIssues.length} item{criticalIssues.length !== 1 ? 's' : ''} missing for completion</span>
            </div>
          )}

          {missingGroupings.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              Missing groupings: {missingGroupings.join(', ')}
            </p>
          )}

          {criticalIssues.length > 0 && (
            <>
              <h3 className="text-sm font-semibold mt-4 mb-2">Critical Issues</h3>
              <MissingItemsList issues={criticalIssues} onNavigate={handleNavigate} />
            </>
          )}

          {warningIssues.length > 0 && (
            <>
              <h3 className="text-sm font-semibold mt-4 mb-2">Warnings</h3>
              <MissingItemsList issues={warningIssues} onNavigate={handleNavigate} />
            </>
          )}

          {issues.length === 0 && (
            <div className="completion-modal-empty">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>All outlooks are complete and discussions are present.</p>
            </div>
          )}
        </div>

        <div className="completion-modal-footer">
          <button
            type="button"
            className="completion-modal-btn completion-modal-btn--cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          {!isComplete && (
            <button
              type="button"
              className="completion-modal-btn completion-modal-btn--complete-anyway"
              onClick={onCompleteWithOmissions}
            >
              Complete with Omissions
            </button>
          )}
          <button
            type="button"
            className="completion-modal-btn completion-modal-btn--complete"
            onClick={onComplete}
          >
            {isComplete ? 'Complete' : 'Complete Anyway'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Helper to derive summary info from validation result. */
function issuesSummary(result: CycleValidationResult) {
  return {
    isComplete: result.isComplete,
    issues: result.issues,
    missingGroupings: result.missingGroupings,
  };
}

export default CompletionValidationModal;
