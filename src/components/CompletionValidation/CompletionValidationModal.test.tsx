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

const defaultHandlers = {
  onClose: jest.fn(),
  onComplete: jest.fn(),
  onCompleteWithOmissions: jest.fn(),
};

const renderModal = (
  validationResult: CycleValidationResult,
  overrides: Partial<React.ComponentProps<typeof CompletionValidationModal>> = {},
) => render(
  <CompletionValidationModal
    isOpen={true}
    validationResult={validationResult}
    {...defaultHandlers}
    {...overrides}
  />,
);

describe('CompletionValidationModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CompletionValidationModal
        isOpen={false}
        validationResult={completeResult}
        {...defaultHandlers}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders complete status badge', () => {
    renderModal(completeResult);
    expect(screen.getByText('Forecast cycle is complete')).toBeInTheDocument();
  });

  it('renders incomplete status badge with issue count', () => {
    renderModal(incompleteResult);
    expect(screen.getByText('1 item missing for completion')).toBeInTheDocument();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = jest.fn();
    renderModal(completeResult, { onClose });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete when Complete is clicked', () => {
    const onComplete = jest.fn();
    renderModal(completeResult, { onComplete });
    fireEvent.click(screen.getByText('Complete'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows "Complete Anyway" for incomplete cycle', () => {
    renderModal(incompleteResult);
    expect(screen.getByText('Complete Anyway')).toBeInTheDocument();
  });

  it('calls onCompleteWithOmissions when "Complete with Omissions" is clicked', () => {
    const onCompleteWithOmissions = jest.fn();
    renderModal(incompleteResult, { onCompleteWithOmissions });
    fireEvent.click(screen.getByText('Complete with Omissions'));
    expect(onCompleteWithOmissions).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigateToIssue when Go button is clicked', () => {
    const onNavigateToIssue = jest.fn();
    renderModal(incompleteResult, { onNavigateToIssue });
    fireEvent.click(screen.getAllByText('Go')[0]);
    expect(onNavigateToIssue).toHaveBeenCalledWith(1);
  });

  it('shows missing groupings summary', () => {
    renderModal(incompleteResult);
    expect(screen.getByText(/Missing groupings: day1/)).toBeInTheDocument();
  });
});
