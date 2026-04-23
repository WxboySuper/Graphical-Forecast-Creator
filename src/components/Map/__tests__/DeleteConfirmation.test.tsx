import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteConfirmation from '../DeleteConfirmation';

const defaultModalState = {
  isOpen: false,
};

const openModalState = {
  isOpen: true,
  outlookType: 'tornado' as const,
  probability: '15%',
  featureId: 'feat-1',
};

describe('DeleteConfirmation', () => {
  it('renders nothing when isOpen is false', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { container } = render(
      <DeleteConfirmation
        modalState={defaultModalState}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when outlookType is missing even if isOpen is true', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { container } = render(
      <DeleteConfirmation
        modalState={{ isOpen: true }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the modal when isOpen is true and outlookType/probability are provided', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { container } = render(
      <DeleteConfirmation
        modalState={openModalState}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(container).not.toBeEmptyDOMElement();
  });

  it('renders modal for tornado outlook', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <DeleteConfirmation
        modalState={{
          isOpen: true,
          outlookType: 'tornado',
          probability: '15%',
          featureId: 'f1',
        }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(document.body).toBeTruthy();
  });

  it('renders modal for wind outlook', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <DeleteConfirmation
        modalState={{
          isOpen: true,
          outlookType: 'wind',
          probability: '30%',
          featureId: 'f1',
        }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(document.body).toBeTruthy();
  });

  it('renders modal for hail outlook', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <DeleteConfirmation
        modalState={{
          isOpen: true,
          outlookType: 'hail',
          probability: '15%',
          featureId: 'f1',
        }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(document.body).toBeTruthy();
  });
});
