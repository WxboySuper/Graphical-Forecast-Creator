/**
 * Feedback UI tests. Cover the dialog states (signed out, form, success,
 * failure) and the beta-only banner and floating button.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import FeedbackDialog from './FeedbackDialog';
import { BetaFeedbackBanner, BetaFeedbackButton } from './BetaFeedbackChrome';
import { FeedbackProvider } from './FeedbackContext';
import { FeedbackSubmitError } from '../../lib/feedbackClient';

const mockUseAuth = jest.fn();
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));

const mockSubmit = jest.fn();
jest.mock('../../lib/feedbackClient', () => ({
  ...jest.requireActual('../../lib/feedbackClient'),
  submitFeedback: (...args: unknown[]) => mockSubmit(...args),
}));

const globals = globalThis as typeof globalThis & { __GFC_BUILD_TARGET__?: string };
const signedIn = { status: 'signed_in', user: { email: 'tester@example.test' } };

const renderDialog = (onOpenChange = jest.fn()) =>
  render(
    <MemoryRouter initialEntries={['/forecast']}>
      <FeedbackDialog open onOpenChange={onOpenChange} />
    </MemoryRouter>
  );

afterEach(() => {
  jest.clearAllMocks();
  globals.__GFC_BUILD_TARGET__ = 'local';
  sessionStorage.clear();
});

describe('FeedbackDialog', () => {
  test('points signed-out visitors at sign in and Discord', () => {
    mockUseAuth.mockReturnValue({ status: 'signed_out', user: null });
    renderDialog();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('link', { name: 'Open Discord' })).toHaveAttribute('href', expect.stringContaining('discord.gg'));
    expect(screen.queryByLabelText(/what happened/i)).not.toBeInTheDocument();
  });

  test('requires a minimum message length before enabling send', () => {
    mockUseAuth.mockReturnValue(signedIn);
    renderDialog();
    const send = screen.getByRole('button', { name: /send feedback/i });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/what happened/i), { target: { value: 'too short' } });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/what happened/i), { target: { value: 'The map froze after loading.' } });
    expect(send).toBeEnabled();
  });

  test('submits category, message, contact consent, and the current page, then confirms', async () => {
    mockUseAuth.mockReturnValue(signedIn);
    mockSubmit.mockResolvedValue('id-1');
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Idea' }));
    fireEvent.change(screen.getByLabelText(/what happened/i), { target: { value: 'Please add a dark basemap.' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/thanks/i);
    expect(mockSubmit).toHaveBeenCalledWith(signedIn.user, {
      category: 'idea',
      message: 'Please add a dark basemap.',
      contactOk: true,
      page: '/forecast',
    });
  });

  test('shows the service error and keeps the draft so the user can retry', async () => {
    mockUseAuth.mockReturnValue(signedIn);
    mockSubmit.mockRejectedValue(new FeedbackSubmitError('You have sent a lot of feedback recently.'));
    renderDialog();
    fireEvent.change(screen.getByLabelText(/what happened/i), { target: { value: 'The map froze after loading.' } });
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/lot of feedback/i);
    expect(screen.getByLabelText(/what happened/i)).toHaveValue('The map froze after loading.');
  });
});

describe('beta chrome', () => {
  test('renders nothing outside the beta build', () => {
    globals.__GFC_BUILD_TARGET__ = 'production';
    const { container } = render(<><BetaFeedbackBanner /><BetaFeedbackButton /></>);
    expect(container).toBeEmptyDOMElement();
  });

  test('banner and floating button open feedback on beta; banner dismissal persists for the session', async () => {
    globals.__GFC_BUILD_TARGET__ = 'beta';
    const openFeedback = jest.fn();
    render(
      <FeedbackProvider openFeedback={openFeedback}>
        <BetaFeedbackBanner />
        <BetaFeedbackButton />
      </FeedbackProvider>
    );

    expect(screen.getByRole('region', { name: 'Beta notice' })).toHaveTextContent(/GFC Beta/);
    fireEvent.click(screen.getByRole('button', { name: 'Send beta feedback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(openFeedback).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss beta notice' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Beta notice' })).not.toBeInTheDocument());
    expect(sessionStorage.getItem('gfc-beta-banner-dismissed')).toBe('1');
    expect(screen.getByRole('button', { name: 'Send beta feedback' })).toBeInTheDocument();
  });
});
