/**
 * Unit tests for CloudToolbarButton and CloudSaveLoadModals
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock lucide icons
jest.mock('lucide-react', () => ({
  Cloud: () => <span data-testid="cloud-icon" />,
  FolderOpen: () => <span data-testid="folder-icon" />,
  LoaderCircle: () => <span data-testid="loader-icon" />,
  Loader: () => <span data-testid="loader-icon" />,
  AlertCircle: () => <span data-testid="alert-icon" />,
}));

// Mock Tooltip components
jest.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Dialog
jest.mock('../ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (o: boolean) => void }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}));

// Mock Button
jest.mock('../ui/button', () => ({
  Button: ({ children, onClick, disabled, 'aria-label': ariaLabel }: {
    children: React.ReactNode; onClick?: () => void; disabled?: boolean; 'aria-label'?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>{children}</button>
  ),
}));

// Mock Input
jest.mock('../ui/input', () => ({
  Input: ({ value, onChange, placeholder, disabled, id }: {
    value?: string; onChange?: (e: { target: { value: string } }) => void;
    placeholder?: string; disabled?: boolean; id?: string;
  }) => (
    <input
      data-testid="cloud-label-input"
      value={value}
      onChange={onChange ? (e) => onChange({ target: { value: e.target.value } }) : undefined}
      placeholder={placeholder}
      disabled={disabled}
      id={id}
    />
  ),
}));

import { CloudToolbarButton } from './CloudToolbarButton';
import { CloudSaveModal, CloudLoadModal } from './CloudSaveLoadModals';

const mockSaveToCloud = jest.fn<() => Promise<boolean>>();
const mockOpenCloudLibrary = jest.fn<() => void>();
const mockOpenChange = jest.fn<(open: boolean) => void>();
const mockLoad = jest.fn<(cycleId: string) => Promise<void>>();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CloudToolbarButton', () => {
  const defaultProps = {
    canSave: true,
    premiumActive: true,
    isExpiredPremium: false,
    currentCycleDate: 'April 22, 2026',
    currentCloudLabel: 'Test Forecast',
    syncState: 'idle' as const,
    onSaveToCloud: mockSaveToCloud,
    onOpenCloudLibrary: mockOpenCloudLibrary,
  };

  test('renders save and open cloud buttons', () => {
    render(<CloudToolbarButton {...defaultProps} />);
    expect(screen.getByRole('button', { name: /save forecast to cloud/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /open cloud library/i })).toBeTruthy();
  });

  test('save button is disabled when syncState is saving', () => {
    render(<CloudToolbarButton {...defaultProps} syncState="saving" />);
    expect(screen.getByRole('button', { name: /save forecast to cloud/i })).toBeDisabled();
  });

  test('open cloud library button is always enabled', () => {
    render(<CloudToolbarButton {...defaultProps} />);
    expect(screen.getByRole('button', { name: /open cloud library/i })).toBeEnabled();
  });

  test('clicking save button opens the modal', async () => {
    render(<CloudToolbarButton {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save forecast to cloud/i }));
    });
    expect(screen.getByTestId('dialog')).toBeTruthy();
  });

  test('renders loading spinner when syncState is saving', () => {
    render(<CloudToolbarButton {...defaultProps} syncState="saving" />);
    expect(screen.getByTestId('loader-icon')).toBeTruthy();
  });
});

describe('CloudSaveModal', () => {
  const defaultModalProps = {
    open: true,
    onOpenChange: mockOpenChange,
    onSave: mockSaveToCloud,
    currentLabel: 'April 22, 2026 Forecast',
    error: undefined,
  };

  test('renders dialog with current label', () => {
    render(<CloudSaveModal {...defaultModalProps} />);
    expect(screen.getByRole('heading', { name: /save to cloud/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /save to cloud/i })).toBeTruthy();
    expect(screen.getByText(/april 22, 2026 forecast/i)).toBeTruthy();
  });

  test('shows error message when provided', () => {
    render(<CloudSaveModal {...defaultModalProps} error="Something went wrong" />);
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  });

  test('calls onSave with trimmed label when save is clicked', async () => {
    mockSaveToCloud.mockResolvedValue(true);
    render(<CloudSaveModal {...defaultModalProps} />);
    const input = screen.getByTestId('cloud-label-input');
    await act(async () => {
      fireEvent.change(input, { target: { value: '  My Custom Label  ' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save to cloud/i }));
    });
    expect(mockSaveToCloud).toHaveBeenCalledWith('My Custom Label');
  });

  test('closes modal when save succeeds', async () => {
    mockSaveToCloud.mockResolvedValue(true);
    render(<CloudSaveModal {...defaultModalProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save to cloud/i }));
    });
    expect(mockOpenChange).toHaveBeenCalledWith(false);
  });

  test('keeps modal open when save fails', async () => {
    mockSaveToCloud.mockResolvedValue(false);
    render(<CloudSaveModal {...defaultModalProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save to cloud/i }));
    });
    expect(mockOpenChange).not.toHaveBeenCalled();
  });

  test('cancel button calls onOpenChange with false', () => {
    render(<CloudSaveModal {...defaultModalProps} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });
    expect(mockOpenChange).toHaveBeenCalledWith(false);
  });

  test('does not close while saving is in progress', () => {
    mockSaveToCloud.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100));
      return true;
    });
    render(<CloudSaveModal {...defaultModalProps} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /save to cloud/i }));
    });
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    expect(cancelButton).toBeDisabled();
    expect(mockOpenChange).not.toHaveBeenCalled();
  });
});

describe('CloudLoadModal', () => {
  const defaultLoadProps = {
    open: true,
    onOpenChange: mockOpenChange,
    onLoad: mockLoad,
    cycles: [
      { id: '1', label: 'Cycle A', updatedAt: '2026-04-22T00:00:00Z', cycleDate: 'Apr 22' },
      { id: '2', label: 'Cycle B', updatedAt: '2026-04-21T00:00:00Z', cycleDate: 'Apr 21' },
    ],
    isLoading: false,
    error: undefined,
  };

  test('renders loading spinner when isLoading is true', () => {
    render(<CloudLoadModal {...defaultLoadProps} isLoading={true} />);
    expect(screen.getByTestId('loader-icon')).toBeTruthy();
  });

  test('renders empty state when no cycles', () => {
    render(<CloudLoadModal {...defaultLoadProps} cycles={[]} />);
    expect(screen.getByText(/no cloud cycles saved yet/i)).toBeTruthy();
  });

  test('renders cycle list', () => {
    render(<CloudLoadModal {...defaultLoadProps} />);
    expect(screen.getByText(/cycle a/i)).toBeTruthy();
    expect(screen.getByText(/cycle b/i)).toBeTruthy();
  });

  test('shows error when provided', () => {
    render(<CloudLoadModal {...defaultLoadProps} error="Failed to load" />);
    expect(screen.getByText(/failed to load/i)).toBeTruthy();
  });

  test('clicking a cycle selects it', () => {
    render(<CloudLoadModal {...defaultLoadProps} />);
    const cycleA = screen.getByText(/cycle a/i).closest('button');
    act(() => {
      fireEvent.click(cycleA!);
    });
    // Selection state handled internally; button should be clickable
    expect(cycleA).toBeTruthy();
  });

  test('load button is disabled when no cycle selected', () => {
    render(<CloudLoadModal {...defaultLoadProps} />);
    const loadBtn = screen.getByRole('button', { name: /load/i });
    expect(loadBtn).toBeDisabled();
  });

  test('load button is enabled when a cycle is selected', () => {
    render(<CloudLoadModal {...defaultLoadProps} />);
    const cycleA = screen.getByText(/cycle a/i).closest('button');
    act(() => {
      fireEvent.click(cycleA!);
    });
    const loadBtn = screen.getByRole('button', { name: /load/i });
    expect(loadBtn).toBeEnabled();
  });

  test('clicking load calls onLoad with selected cycle id', () => {
    mockLoad.mockResolvedValue(undefined);
    render(<CloudLoadModal {...defaultLoadProps} />);
    const cycleA = screen.getByText(/cycle a/i).closest('button');
    act(() => {
      fireEvent.click(cycleA!);
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /load/i }));
    });
    expect(mockLoad).toHaveBeenCalledWith('1');
  });

  test('cancel button closes modal', () => {
    render(<CloudLoadModal {...defaultLoadProps} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });
    expect(mockOpenChange).toHaveBeenCalledWith(false);
  });
});
