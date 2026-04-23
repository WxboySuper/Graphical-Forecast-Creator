import React from 'react';
import { render, screen } from '@testing-library/react';
import PrivacyPolicyModal from './PrivacyPolicyModal';

describe('PrivacyPolicy', () => {
  it('renders without crashing', () => {
    render(<PrivacyPolicyModal onAccept={jest.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders privacy policy title', () => {
    render(<PrivacyPolicyModal onAccept={jest.fn()} />);
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();
  });

  it('renders acceptance footer with checkbox and buttons', () => {
    render(<PrivacyPolicyModal onAccept={jest.fn()} />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });

  it('accept button is disabled when checkbox is not checked', () => {
    render(<PrivacyPolicyModal onAccept={jest.fn()} />);
    const acceptButton = screen.getByRole('button', { name: /accept/i }) as HTMLButtonElement;
    expect(acceptButton).toBeDisabled();
  });

  it('renders close button when onClose is provided in view-only mode', () => {
    const onClose = jest.fn();
    render(<PrivacyPolicyModal onClose={onClose} onAccept={jest.fn()} viewOnly={true} />);
    const closeButtons = screen.getAllByRole('button');
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  it('has policy content sections', () => {
    render(<PrivacyPolicyModal onAccept={jest.fn()} />);
    expect(screen.getByText(/local-first by default/i)).toBeInTheDocument();
    expect(screen.getByText(/account.*authentication/i)).toBeInTheDocument();
  });
});