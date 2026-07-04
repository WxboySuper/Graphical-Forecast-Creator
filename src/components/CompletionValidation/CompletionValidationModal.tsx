// skipcq: JS-W1028
import React, { useCallback } from 'react';
import type { CycleValidationResult } from '../../types/workflow';
import type { DayType } from '../../types/outlooks';
import {
  CompletionValidationModalBody,
  CompletionValidationModalFooter,
  hasAllOmissionReasons,
} from './CompletionValidationModalSections';
import './CompletionValidationModal.css';

interface CompletionValidationModalProps {
  isOpen: boolean;
  validationResult: CycleValidationResult | null;
  omittedDays: Partial<Record<DayType, string>>;
  onClose: () => void;
  onComplete: () => void;
  onCompleteWithOmissions: () => void;
  onOmitDay: (day: DayType, reason: string) => void;
  onNavigateToIssue?: (day: DayType) => void;
}

/** Maps a validation grouping key to its primary forecast day number. */
const getGroupingDay = (grouping: string): DayType | null => {
  switch (grouping) {
    case 'day1': return 1;
    case 'day2': return 2;
    case 'day3': return 3;
    case 'day4-8': return 4;
    default: return null;
  }
};

/** Renders the completion validation modal when cycle review is requested. */
export const CompletionValidationModal: React.FC<CompletionValidationModalProps> = ({
  isOpen,
  validationResult,
  omittedDays,
  onClose,
  onComplete,
  onCompleteWithOmissions,
  onOmitDay,
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
    [onNavigateToIssue],
  );

  if (!isOpen || !validationResult) return null;

  const { isComplete, issues, missingGroupings } = validationResult;
  const criticalIssues = issues.filter((issue) => issue.severity === 'critical');
  const warningIssues = issues.filter((issue) => issue.severity === 'warning');
  const canCompleteWithOmissions = hasAllOmissionReasons(missingGroupings, omittedDays);

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

        <CompletionValidationModalBody
          isComplete={isComplete}
          issues={issues}
          criticalIssues={criticalIssues}
          warningIssues={warningIssues}
          missingGroupings={missingGroupings}
          omittedDays={omittedDays}
          onNavigate={handleNavigate}
          onOmitDay={onOmitDay}
        />

        <CompletionValidationModalFooter
          isComplete={isComplete}
          canCompleteWithOmissions={canCompleteWithOmissions}
          onClose={onClose}
          onComplete={onComplete}
          onCompleteWithOmissions={onCompleteWithOmissions}
        />
      </div>
    </div>
  );
};

export default CompletionValidationModal;
