/**
 * Feedback UI tests. Cover the dialog states (signed out, form, success,
 * failure) and the beta-only banner and floating button.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  test('shows a loading state instead of sign-in prompts while auth resolves', () => {
    mockUseAuth.mockReturnValue({ status: 'loading', user: null });
    renderDialog();
    expect(screen.getByRole('status')).toHaveTextContent(/checking your account/i);
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
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

describe('FeedbackDialog sessions', () => {
  test('a submission that finishes after the dialog closed does not show a stale confirmation on reopen', async () => {
    mockUseAuth.mockReturnValue(signedIn);
    let finish: (id: string) => void = () => undefined;
    mockSubmit.mockReturnValue(new Promise<string>((resolve) => { finish = resolve; }));
    const Harness = () => {
      const [open, setOpen] = React.useState(true);
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setOpen(true)}>reopen</button>
          <FeedbackDialog open={open} onOpenChange={setOpen} />
        </MemoryRouter>
      );
    };
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/what happened/i), { target: { value: 'The map froze after loading.' } });
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await act(async () => { finish('late'); });
    fireEvent.click(screen.getByText('reopen'));

    expect(await screen.findByLabelText(/what happened/i)).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('an unsent draft is discarded when the dialog is closed and reopened', async () => {
    mockUseAuth.mockReturnValue(signedIn);
    const Harness = () => {
      const [open, setOpen] = React.useState(true);
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setOpen(true)}>reopen</button>
          <FeedbackDialog open={open} onOpenChange={setOpen} />
        </MemoryRouter>
      );
    };
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/what happened/i), { target: { value: 'A draft I never sent.' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('reopen'));
    expect(await screen.findByLabelText(/what happened/i)).toHaveValue('');
  });
});

describe('beta chrome', () => {
  test('hides the banner feedback action when the feedback service is not configured', () => {
    const scope = globalThis as typeof globalThis & { __GFC_FEEDBACK_API_URL__?: string };
    const original = scope.__GFC_FEEDBACK_API_URL__;
    globals.__GFC_BUILD_TARGET__ = 'beta';
    scope.__GFC_FEEDBACK_API_URL__ = '';
    try {
      render(<><BetaFeedbackBanner /><BetaFeedbackButton /></>);
      expect(screen.getByRole('region', { name: 'Beta notice' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send feedback' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send beta feedback' })).not.toBeInTheDocument();
    } finally {
      scope.__GFC_FEEDBACK_API_URL__ = original;
    }
  });

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
    expect(document.documentElement.style.getPropertyValue('--beta-banner-height')).toBe('0px');
    expect(screen.getByRole('button', { name: 'Send beta feedback' })).toBeInTheDocument();
  });
});
