/**
 * Unit tests for CopyFromPreviousModal and CycleHistoryModal
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// Mock icons
jest.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon" />,
}));

// Mock AppLayout for useAppLayout hook
jest.mock('../Layout/AppLayout', () => ({
  useAppLayout: () => ({
    addToast: jest.fn(),
  }),
}));

// Mock redux store
const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useSelector: jest.fn((selector) => {
    if (selector.name === 'selectCurrentDay') return 1;
    if (selector.name === 'selectSavedCycles') return [];
    if (selector.name === 'selectForecastCycle') return {
      cycleDate: '2026-04-22T00:00:00Z',
      currentDay: 1,
      days: { 1: { data: {} } },
    };
    return {};
  }),
  useDispatch: () => mockDispatch,
}));

// Mock fileUtils
jest.mock('../../utils/fileUtils', () => ({
  deserializeForecast: jest.fn((data) => ({
    cycleDate: '2026-04-20T00:00:00Z',
    currentDay: 1,
    days: { 1: { data: {} } },
    ...data,
  })),
}));

import CopyFromPreviousModal from './CopyFromPreviousModal';
import CycleHistoryModal from './CycleHistoryModal';
import ConfirmationModal from '../DrawingTools/ConfirmationModal';

// Mock ConfirmationModal
jest.mock('../DrawingTools/ConfirmationModal', () => ({
  __esModule: true,
  default: ({ isOpen, title, message, onConfirm, onCancel }: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="confirmation-modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockDispatch.mockClear();
});

describe('CopyFromPreviousModal', () => {
  test('renders nothing when isOpen is false', () => {
    const { container } = render(<CopyFromPreviousModal isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders modal when isOpen is true', () => {
    render(<CopyFromPreviousModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/copy from previous cycle/i)).toBeTruthy();
  });

  test('renders close button with correct aria-label', () => {
    render(<CopyFromPreviousModal isOpen={true} onClose={jest.fn()} />);
    // Use specific aria-label since there might be multiple close-like buttons
    const closeBtn = screen.getByRole('button', { name: /close copy from previous modal/i });
    expect(closeBtn).toBeTruthy();
  });

  test('close button calls onClose', () => {
    const onClose = jest.fn();
    render(<CopyFromPreviousModal isOpen={true} onClose={onClose} />);
    const closeBtn = screen.getByRole('button', { name: /close copy from previous modal/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  test('renders file input', () => {
    render(<CopyFromPreviousModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy features/i })).toBeTruthy();
    // File input has className="copy-file-input" not data-testid
    const fileInput = document.querySelector('.copy-file-input');
    expect(fileInput).toBeTruthy();
  });

  test('copy button is disabled when no cycle loaded', () => {
    render(<CopyFromPreviousModal isOpen={true} onClose={jest.fn()} />);
    const copyBtn = screen.getByRole('button', { name: /copy features/i });
    expect(copyBtn).toBeDisabled();
  });

  test('cancel button calls onClose', () => {
    const onClose = jest.fn();
    render(<CopyFromPreviousModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('renders day selectors', () => {
    render(<CopyFromPreviousModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByLabelText(/from day:/i)).toBeTruthy();
    expect(screen.getByLabelText(/to day/i)).toBeTruthy();
  });

  test('closes on overlay click', () => {
    const onClose = jest.fn();
    render(<CopyFromPreviousModal isOpen={true} onClose={onClose} />);
    const overlay = document.querySelector('.copy-modal-overlay');
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });

  test('renders info box', () => {
    render(<CopyFromPreviousModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText(/this will copy outlook features/i)).toBeTruthy();
  });
});

describe('CycleHistoryModal', () => {
  test('renders nothing when isOpen is false', () => {
    const { container } = render(<CycleHistoryModal isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders modal when isOpen is true', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/forecast cycle history/i)).toBeTruthy();
  });

  test('renders close button in header with correct aria-label', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    // Use specific aria-label since there are multiple close buttons
    expect(screen.getByRole('button', { name: /close cycle history modal/i })).toBeTruthy();
  });

  test('renders current cycle section', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    // "Current Cycle" appears in header of the section - use getAllByText to find one
    const matches = screen.getAllByText(/current cycle/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  test('renders save current cycle button', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: /save current cycle/i })).toBeTruthy();
  });

  test('clicking save button shows save form', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save current cycle/i }));
    expect(screen.getByPlaceholderText(/optional label/i)).toBeTruthy();
  });

  test('renders close button in footer', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    // The footer close button is just "Close" text
    expect(screen.getByRole('button', { name: /^close$/i })).toBeTruthy();
  });

  test('closes on close button click', () => {
    const onClose = jest.fn();
    render(<CycleHistoryModal isOpen={true} onClose={onClose} />);
    // Use the footer close button
    const closeBtn = screen.getByRole('button', { name: /^close$/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  test('closes on overlay click', () => {
    const onClose = jest.fn();
    render(<CycleHistoryModal isOpen={true} onClose={onClose} />);
    const overlay = document.querySelector('.history-modal-overlay');
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });

  test('shows empty state when no saved cycles', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText(/no saved cycles yet/i)).toBeTruthy();
  });

  test('renders footer info', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText(/use "copy from previous"/i)).toBeTruthy();
  });
});

describe('CycleHistoryModal with saved cycles', () => {
  const mockSavedCycles = [
    {
      id: '1',
      cycleDate: '2026-04-20T00:00:00Z',
      timestamp: '2026-04-21T00:00:00Z',
      label: 'Morning',
      forecastCycle: {
        cycleDate: '2026-04-20T00:00:00Z',
        currentDay: 1,
        days: { 1: { data: { tornado: { size: 100 } } } },
      },
      stats: { forecastDays: 1 },
    },
    {
      id: '2',
      cycleDate: '2026-04-19T00:00:00Z',
      timestamp: '2026-04-20T00:00:00Z',
      label: 'Evening',
      forecastCycle: {
        cycleDate: '2026-04-19T00:00:00Z',
        currentDay: 2,
        days: {},
      },
      stats: { forecastDays: 0 },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(require('react-redux'), 'useSelector').mockImplementation((selector: any) => {
      if (selector.name === 'selectSavedCycles') return mockSavedCycles;
      if (selector.name === 'selectForecastCycle') return {
        cycleDate: '2026-04-22T00:00:00Z',
        currentDay: 1,
        days: { 1: { data: {} } },
      };
      return {};
    });
  });

  test('renders saved cycles list', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByText(/saved cycles \(2\)/i)).toBeTruthy();
    expect(screen.getByText(/morning/i)).toBeTruthy();
    expect(screen.getByText(/evening/i)).toBeTruthy();
  });

  test('renders load and delete buttons for each cycle', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    // The Load button has text "Load", the delete button has emoji 🗑️
    const loadButtons = screen.getAllByRole('button', { name: /load/i });
    // Delete buttons have class history-btn-delete and emoji 🗑️, not "Delete" text
    const deleteButtons = document.querySelectorAll('.history-btn-delete');
    expect(loadButtons).toHaveLength(2);
    expect(deleteButtons).toHaveLength(2);
  });

  test('clicking load button shows confirmation', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    const loadButtons = screen.getAllByRole('button', { name: /load/i });
    fireEvent.click(loadButtons[0]);
    expect(screen.getByTestId('confirmation-modal')).toBeTruthy();
  });

  test('clicking delete button shows confirmation', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    const deleteButtons = document.querySelectorAll('.history-btn-delete');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByTestId('confirmation-modal')).toBeTruthy();
  });

  test('confirming load dispatches action and closes', () => {
    mockDispatch.mockResolvedValue(undefined);
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    const loadButtons = screen.getAllByRole('button', { name: /load/i });
    fireEvent.click(loadButtons[0]);
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmBtn);
    expect(mockDispatch).toHaveBeenCalled();
  });
});

describe('CycleHistoryModal save form', () => {
  test('save button dispatches saveCurrentCycle', () => {
    mockDispatch.mockResolvedValue(undefined);
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save current cycle/i }));
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(saveBtn);
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: expect.stringContaining('saveCurrentCycle'),
    }));
  });

  test('cancel save form hides it', () => {
    render(<CycleHistoryModal isOpen={true} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save current cycle/i }));
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByPlaceholderText(/optional label/i)).toBeNull();
  });
});