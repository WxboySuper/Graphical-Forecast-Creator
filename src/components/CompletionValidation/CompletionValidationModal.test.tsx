import { render, screen, fireEvent } from '@testing-library/react';
import CompletionValidationModal from './CompletionValidationModal';
import type { CycleValidationResult } from '../../types/workflow';

jest.mock('lucide-react', () => ({
  CheckCircle2: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
  AlertTriangle: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
}));

const completeResult: CycleValidationResult = {
  isComplete: true,
  issues: [],
  missingGroupings: [],
};

const incompleteResult: CycleValidationResult = {
  isComplete: false,
  issues: [
    {
      day: 'day1',
      outlookType: 'tornado',
      type: 'missing-polygon',
      message: 'Day 1 tornado outlook: no polygon drawn',
      severity: 'critical',
      canNavigate: true,
    },
    {
      day: 'day2',
      outlookType: 'categorical',
      type: 'missing-discussion',
      message: 'Day 2: discussion is missing or empty',
      severity: 'warning',
      canNavigate: true,
    },
  ],
  missingGroupings: ['day1'],
};

describe('CompletionValidationModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CompletionValidationModal
        isOpen={false}
        validationResult={completeResult}
        onClose={jest.fn()}
        onComplete={jest.fn()}
        onCompleteWithOmissions={jest.fn()}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders complete status badge', () => {
    render(
      <CompletionValidationModal
        isOpen={true}
        validationResult={completeResult}
        onClose={jest.fn()}
        onComplete={jest.fn()}
        onCompleteWithOmissions={jest.fn()}
      />
    );
    expect(screen.getByText('Forecast cycle is complete')).toBeInTheDocument();
  });

  it('renders incomplete status badge with issue count', () => {
    render(
      <CompletionValidationModal
        isOpen={true}
        validationResult={incompleteResult}
        onClose={jest.fn()}
        onComplete={jest.fn()}
        onCompleteWithOmissions={jest.fn()}
      />
    );
    expect(screen.getByText('1 item missing for completion')).toBeInTheDocument();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = jest.fn();
    render(
      <CompletionValidationModal
        isOpen={true}
        validationResult={completeResult}
        onClose={onClose}
        onComplete={jest.fn()}
        onCompleteWithOmissions={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete when Complete is clicked', () => {
    const onComplete = jest.fn();
    render(
      <CompletionValidationModal
        isOpen={true}
        validationResult={completeResult}
        onClose={jest.fn()}
        onComplete={onComplete}
        onCompleteWithOmissions={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('Complete'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows "Complete Anyway" for incomplete cycle', () => {
    const onComplete = jest.fn();
    render(
      <CompletionValidationModal
        isOpen={true}
        validationResult={incompleteResult}
        onClose={jest.fn()}
        onComplete={onComplete}
        onCompleteWithOmissions={jest.fn()}
      />
    );
    const completeAnyway = screen.getByText('Complete Anyway');
    expect(completeAnyway).toBeInTheDocument();
  });

  it('calls onCompleteWithOmissions when "Complete with Omissions" is clicked', () => {
    const onCompleteWithOmissions = jest.fn();
    render(
      <CompletionValidationModal
        isOpen={true}
        validationResult={incompleteResult}
        onClose={jest.fn()}
        onComplete={jest.fn()}
        onCompleteWithOmissions={onCompleteWithOmissions}
      />
    );
    fireEvent.click(screen.getByText('Complete with Omissions'));
    expect(onCompleteWithOmissions).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigateToIssue when Go button is clicked', () => {
    const onNavigateToIssue = jest.fn();
    render(
      <CompletionValidationModal
        isOpen={true}
        validationResult={incompleteResult}
        onClose={jest.fn()}
        onComplete={jest.fn()}
        onCompleteWithOmissions={jest.fn()}
        onNavigateToIssue={onNavigateToIssue}
      />
    );
    const goButtons = screen.getAllByText('Go');
    fireEvent.click(goButtons[0]);
    expect(onNavigateToIssue).toHaveBeenCalledWith(1);
  });

  it('shows missing groupings summary', () => {
    render(
      <CompletionValidationModal
        isOpen={true}
        validationResult={incompleteResult}
        onClose={jest.fn()}
        onComplete={jest.fn()}
        onCompleteWithOmissions={jest.fn()}
      />
    );
    expect(screen.getByText(/Missing groupings: day1/)).toBeInTheDocument();
  });
});
