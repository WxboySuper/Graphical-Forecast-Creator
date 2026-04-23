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
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <DeleteConfirmation
        modalState={{ isOpen: false }}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when outlookType is missing even if open', () => {
    const { container } = render(
      <DeleteConfirmation
        modalState={{ isOpen: true, probability: '30%' }}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when probability is missing even if open', () => {
    const { container } = render(
      <DeleteConfirmation
        modalState={{ isOpen: true, outlookType: 'categorical' }}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
      />
    );
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

  it('calls onConfirm when delete button is clicked', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when keep button is clicked', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /keep/i }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });
});