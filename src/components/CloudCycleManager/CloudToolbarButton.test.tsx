import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CloudToolbarButton } from './CloudToolbarButton';

// Mock CloudSaveModal
jest.mock('./CloudSaveLoadModals', () => ({
  CloudSaveModal: ({ open, onSave, error }: { children: React.ReactNode }) => open ? (
    <div data-testid="save-modal">
      {error && <div data-testid="modal-error">{error}</div>}
      <button onClick={() => onSave('New Label')}>Confirm Save</button>
    </div>
  ) : null,
}));

// Mock ui components to simplify testing (avoid tooltip/portal issues)
jest.mock('../ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: { children: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

jest.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('CloudToolbarButton', () => {
  const onSaveToCloud = jest.fn();
  const onOpenCloudLibrary = jest.fn();
  const defaultToolbarProps = {
    canSave: true,
    premiumActive: true,
    isExpiredPremium: false,
    currentCycleDate: '20260401',
    onSaveToCloud,
    onOpenCloudLibrary,
  };

  const renderToolbar = (props: Partial<React.ComponentProps<typeof CloudToolbarButton>> = {}) =>
    render(<CloudToolbarButton {...defaultToolbarProps} {...props} />);

  const openSaveModal = () => {
    fireEvent.click(screen.getByText('Save to Cloud'));
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders save and open actions', () => {
    renderToolbar();
    expect(screen.getByText('Save to Cloud')).toBeInTheDocument();
    expect(screen.getByText('Open Cloud')).toBeInTheDocument();
  });

  test('opens save modal on click', () => {
    renderToolbar();
    
    openSaveModal();
    expect(screen.getByTestId('save-modal')).toBeInTheDocument();
  });

  test('shows error in modal when canSave is false (not premium)', () => {
    renderToolbar({ canSave: false, premiumActive: false });
    
    openSaveModal();
    expect(screen.getByTestId('modal-error')).toHaveTextContent('Subscribe to premium');
  });

  test('shows error in modal when premium expired', () => {
    renderToolbar({ canSave: false, isExpiredPremium: true });
    
    openSaveModal();
    expect(screen.getByTestId('modal-error')).toHaveTextContent('premium subscription has expired');
  });

  test('handles successful save', async () => {
    onSaveToCloud.mockResolvedValue();
    renderToolbar();
    
    openSaveModal();
    
    fireEvent.click(screen.getByText('Confirm Save'));

    await waitFor(() => expect(onSaveToCloud).toHaveBeenCalledWith('New Label'));
    await waitFor(() => expect(screen.queryByTestId('save-modal')).not.toBeInTheDocument());
  });

  test('handles save error from callback', async () => {
    onSaveToCloud.mockRejectedValue(new Error('API Error'));
    renderToolbar();
    
    openSaveModal();
    
    fireEvent.click(screen.getByText('Confirm Save'));

    await waitFor(() => expect(screen.getByTestId('modal-error')).toHaveTextContent('API Error'));
    expect(screen.getByTestId('save-modal')).toBeInTheDocument();
  });

  test('calls onOpenCloudLibrary', () => {
    renderToolbar();
    
    fireEvent.click(screen.getByText('Open Cloud'));
    expect(onOpenCloudLibrary).toHaveBeenCalled();
  });

  test('disables save button when saving', () => {
    renderToolbar({ syncState: 'saving' });
    expect(screen.getByLabelText('Save forecast to cloud')).toBeDisabled();
  });
});
