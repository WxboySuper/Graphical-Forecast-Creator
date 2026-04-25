import React from 'react';
import { render, screen } from '@testing-library/react';
import VerificationPage from './VerificationPage';

jest.mock('../components/VerificationMode/VerificationMode', () => () => (
  <div data-testid="verification-mode">Verification Mode</div>
));

describe('VerificationPage', () => {
  it('renders verification mode', () => {
    render(<VerificationPage />);

    expect(screen.getByTestId('verification-mode')).toHaveTextContent('Verification Mode');
  });
});
