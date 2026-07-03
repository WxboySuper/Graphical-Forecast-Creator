// skipcq: JS-W1028
import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ValidationIssue } from '../../types/workflow';
import { MissingItemsList } from './MissingItemsList';

interface CompletionValidationModalBodyProps {
  isComplete: boolean;
  issues: ValidationIssue[];
  criticalIssues: ValidationIssue[];
  warningIssues: ValidationIssue[];
  missingGroupings: string[];
  onNavigate: (grouping: string) => void;
}

export const CompletionValidationModalBody: React.FC<CompletionValidationModalBodyProps> = ({
  isComplete,
  issues,
  criticalIssues,
  warningIssues,
  missingGroupings,
  onNavigate,
}) => (
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
        <MissingItemsList issues={criticalIssues} onNavigate={onNavigate} />
      </>
    )}

    {warningIssues.length > 0 && (
      <>
        <h3 className="text-sm font-semibold mt-4 mb-2">Warnings</h3>
        <MissingItemsList issues={warningIssues} onNavigate={onNavigate} />
      </>
    )}

    {issues.length === 0 && (
      <div className="completion-modal-empty">
        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
        <p>All outlooks are complete and discussions are present.</p>
      </div>
    )}
  </div>
);

interface CompletionValidationModalFooterProps {
  isComplete: boolean;
  onClose: () => void;
  onComplete: () => void;
  onCompleteWithOmissions: () => void;
}

export const CompletionValidationModalFooter: React.FC<CompletionValidationModalFooterProps> = ({
  isComplete,
  onClose,
  onComplete,
  onCompleteWithOmissions,
}) => (
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
);
