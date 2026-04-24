import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import DeleteConfirmation from './DeleteConfirmation';

const mockOnConfirm = jest.fn();
const mockOnCancel = jest.fn();

beforeEach(() => {
  mockOnConfirm.mockClear();
  mockOnCancel.mockClear();
});

describe('DeleteConfirmation', () => {
  const renderDeleteConfirmation = (modalState: React.ComponentProps<typeof DeleteConfirmation>['modalState']) =>
    render(
      <DeleteConfirmation
        modalState={modalState}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
      />
    );

  it.each([
    ['renders nothing when isOpen is false', { isOpen: false }],
    ['renders nothing when outlookType is missing even if open', { isOpen: true, probability: '30%' }],
    ['renders nothing when probability is missing even if open', { isOpen: true, outlookType: 'categorical' }],
  ])('%s', (_name, modalState) => {
    const { container } = renderDeleteConfirmation(modalState);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders confirmation content when open with all required props', () => {
    render(
      <DeleteConfirmation
        modalState={{
          isOpen: true,
          outlookType: 'categorical',
          probability: '30%',
          featureId: 'feature-1',
        }}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
      />
    );
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep/i })).toBeInTheDocument();
  });

  it.each([
    ['calls onConfirm when delete button is clicked', /delete/i, mockOnConfirm],
    ['calls onCancel when keep button is clicked', /keep/i, mockOnCancel],
  ])('%s', (_name, buttonName, handler) => {
    renderDeleteConfirmation({
      isOpen: true,
      outlookType: 'categorical',
      probability: '30%',
      featureId: 'feature-1',
    });

    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
