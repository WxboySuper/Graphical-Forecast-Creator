/**
 * Privacy-policy modal test boundary: this suite verifies acceptance state,
 * policy-version upgrades, modal rendering, and user actions at the privacy
 * consent UI boundary.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import PrivacyPolicyModal, {
  hasAcceptedPrivacyPolicy,
  isPrivacyPolicyUpgrade,
} from './PrivacyPolicyModal';
import { setTelemetryConsent } from '../../lib/telemetry';

describe('PrivacyPolicyModal Utils', () => {
  beforeEach(() => {
    setTelemetryConsent('unset');
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('hasAcceptedPrivacyPolicy returns false when not accepted', () => {
    expect(hasAcceptedPrivacyPolicy()).toBe(false);
  });

  test('hasAcceptedPrivacyPolicy returns true when accepted current version', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '4');
    expect(hasAcceptedPrivacyPolicy()).toBe(true);
  });

  test('hasAcceptedPrivacyPolicy returns false when accepted older version', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '1.0.0');
    expect(hasAcceptedPrivacyPolicy()).toBe(false);
  });

  test('hasAcceptedPrivacyPolicy returns false when localStorage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage error');
    });
    expect(hasAcceptedPrivacyPolicy()).toBe(false);
  });

  test('isPrivacyPolicyUpgrade returns false when not previously accepted', () => {
    expect(isPrivacyPolicyUpgrade()).toBe(false);
  });

  test('isPrivacyPolicyUpgrade returns true when an older version was accepted', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '1.0.0');
    expect(isPrivacyPolicyUpgrade()).toBe(true);
  });

  test('requires users with the previous semver version to accept Version 4', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '1.8.0');
    expect(hasAcceptedPrivacyPolicy()).toBe(false);
    expect(isPrivacyPolicyUpgrade()).toBe(true);
  });

  test('isPrivacyPolicyUpgrade returns false when current version was accepted', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '4');
    expect(isPrivacyPolicyUpgrade()).toBe(false);
  });
});

describe('PrivacyPolicyModal component', () => {
  const onAcceptMock = jest.fn();
  const onCloseMock = jest.fn();

  beforeEach(() => {
    setTelemetryConsent('unset');
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders acceptance mode by default', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    expect(screen.getByText('Accept & Continue')).toBeInTheDocument();
    expect(screen.getByText('Accept & Continue')).toBeDisabled();
  });

  test('shows last updated date and whats new when upgrading from an older policy', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '1.0.0');
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    expect(screen.getByText(/Last updated November 21, 2026/u)).toBeInTheDocument();
    const note = screen.getByRole('note');
    expect(note).toBeInTheDocument();
    expect(within(note).getByText(/What's new in version 4/u)).toBeInTheDocument();
    expect(within(note).getByText(/hosted error monitoring \(Sentry\)/u)).toBeInTheDocument();
    expect(within(note).getByText(/Google Analytics \(GA4\)/u)).toBeInTheDocument();
  });

  test('shows only newer changes when upgrading from v1.2', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '1.2.0');
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    const note = screen.getByRole('note');
    expect(note).toBeInTheDocument();
    expect(within(note).getByText(/Google Analytics \(GA4\)/u)).toBeInTheDocument();
    expect(within(note).queryByText(/hosted error monitoring \(Sentry\)/u)).not.toBeInTheDocument();
  });

  test('announces the feedback disclosure to users upgrading from v1.7', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '1.7.0');
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    const note = screen.getByRole('note');
    expect(within(note).getByText(/Send feedback form/u)).toBeInTheDocument();
    expect(within(note).queryByText(/Google Analytics \(GA4\)/u)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /6\. Feedback You Send Us/u })).toBeInTheDocument();
    expect(screen.getAllByText(/not removed automatically when you delete your account/u).length).toBeGreaterThan(0);
  });

  test('shows the new flat-version entry for users who accepted the previous semver policy', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '1.8.0');
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    expect(within(screen.getByRole('note')).getByText(/flat Version 2 label/u)).toBeInTheDocument();
  });

  test('lists contact@gfcweather.com as the privacy and deletion contact', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} viewOnly onClose={onCloseMock} />);
    const link = screen.getByRole('link', { name: 'contact@gfcweather.com' });
    expect(link).toHaveAttribute('href', 'mailto:contact@gfcweather.com');
    expect(screen.queryByText(/weatherboysuper\.com/u)).not.toBeInTheDocument();
  });

  test('hides whats new for first-time users in acceptance mode', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    expect(screen.getByText(/Last updated November 21, 2026/u)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(/What's new in version/u)).not.toBeInTheDocument();
  });

  test('hides whats new in view-only mode but shows version date', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} viewOnly onClose={onCloseMock} />);
    expect(screen.getByText(/Version 4 — Last updated November 21, 2026/u)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(/What's new in version/i)).not.toBeInTheDocument();
  });

  test('enables accept button when checkbox is checked', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(screen.getByText('Accept & Continue')).toBeEnabled();
  });

  test('describes the always-on counts and the optional statistics without an in-policy toggle', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Usage Counts, Optional Feature Statistics/u })).toBeInTheDocument();
    expect(screen.getByText(/closing the prompt without choosing counts as No thanks/u)).toBeInTheDocument();
    expect(screen.getByText(/deleted by a scheduled job at the start of the next day/u)).toBeInTheDocument();
    expect(screen.queryByText(/Umami tracker|self-hosted, cookie-free Umami/u)).not.toBeInTheDocument();
  });

  test('calls onAccept and updates localStorage when accepted', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    const acceptButton = screen.getByText('Accept & Continue');
    fireEvent.click(acceptButton);

    expect(onAcceptMock).toHaveBeenCalled();
    expect(localStorage.getItem('gfc-privacy-policy-accepted')).toBe('4');
  });

  test('renders view-only mode when specified', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} viewOnly onClose={onCloseMock} />);
    expect(screen.getByText('Close')).toBeInTheDocument();
    expect(screen.queryByText('Accept & Continue')).not.toBeInTheDocument();
  });

  test('calls onClose when close button clicked in view-only mode', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} viewOnly onClose={onCloseMock} />);
    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);
    expect(onCloseMock).toHaveBeenCalled();
  });

  test('calls onClose when top-right X is clicked in view-only mode', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} viewOnly onClose={onCloseMock} />);
    const xButton = screen.getByLabelText('Close');
    fireEvent.click(xButton);
    expect(onCloseMock).toHaveBeenCalled();
  });

test('handles localStorage.setItem throwing in handleAccept', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage error');
    });
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Accept & Continue'));
    
    expect(onAcceptMock).toHaveBeenCalled();
  });
});
