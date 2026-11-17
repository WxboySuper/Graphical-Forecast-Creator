/**
 * Verification page tests. Cover feature-exposure routing between classic verification and Forecast Grade.
 */
import { render, screen, waitFor } from '@testing-library/react';
import * as flagsModule from '../config/flags';

jest.mock('../components/VerificationMode/VerificationMode', () => () => (
  <div data-testid="verification-mode">Verification Mode</div>
));

jest.mock('../components/ForecastGrade/ForecastGradeDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="forecast-grade-dashboard">Forecast Grade dashboard</div>,
}));

const renderPage = () => {
  const VerificationPage = require('./VerificationPage').default;
  return render(<VerificationPage />);
};

describe('VerificationPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders classic verification mode when verificationRelaunch is off', () => {
    jest.spyOn(flagsModule, 'flag').mockReturnValue(false);
    renderPage();
    expect(screen.getByTestId('verification-mode')).toHaveTextContent('Verification Mode');
  });

  it('renders the Forecast Grade dashboard when verificationRelaunch is on', async () => {
    jest.spyOn(flagsModule, 'flag').mockReturnValue(true);
    renderPage();
    expect(await screen.findByTestId('forecast-grade-dashboard')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('verification-mode')).not.toBeInTheDocument();
    });
  });
});
