/**
 * Run-progress indicator. Renders the current verification stage and percentage
 * through one accessible live status region.
 */
import React from 'react';
import type { GradeProgress } from '../../utils/verificationV2';

interface RunProgressProps {
  progress: GradeProgress | null;
}

const RunProgress: React.FC<RunProgressProps> = ({ progress }) => {
  if (!progress) {
    return null;
  }
  const percent = Math.round(progress.fraction * 100);
  return (
    <div className="fg-run-progress" role="status" aria-live="polite">
      <div className="fg-run-progress__header">
        <span>{progress.label}</span>
        <span className="fg-run-progress__percent">{percent}%</span>
      </div>
      <div className="fg-run-progress__track" aria-label={`${progress.label}: ${percent}% complete`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="fg-run-progress__footer">
        <span>Evidence</span>
        <span>Scoring</span>
        <span>Summary</span>
      </div>
    </div>
  );
};

export default RunProgress;