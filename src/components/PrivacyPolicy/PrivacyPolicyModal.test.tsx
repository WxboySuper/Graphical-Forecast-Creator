import { render, screen, fireEvent } from '@testing-library/react';
import PrivacyPolicyModal, {
  hasAcceptedPrivacyPolicy,
  isPrivacyPolicyUpgrade,
} from './PrivacyPolicyModal';

describe('PrivacyPolicyModal Utils', () => {
  beforeEach(() => {
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
    localStorage.setItem('gfc-privacy-policy-accepted', '1.2.0');
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

  test('isPrivacyPolicyUpgrade returns false when current version was accepted', () => {
    localStorage.setItem('gfc-privacy-policy-accepted', '1.2.0');
    expect(isPrivacyPolicyUpgrade()).toBe(false);
  });

  test('isPrivacyPolicyUpgrade returns false when localStorage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage error');
    });
    expect(isPrivacyPolicyUpgrade()).toBe(false);
  });
});

describe('PrivacyPolicyModal component', () => {
  const onAcceptMock = jest.fn();
  const onCloseMock = jest.fn();

  beforeEach(() => {
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
    expect(screen.getByText(/Last updated May 22, 2026/u)).toBeInTheDocument();
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText(/What's new in version 1\.2\.0/u)).toBeInTheDocument();
    expect(screen.getByText(/hosted error monitoring \(Sentry\)/u)).toBeInTheDocument();
  });

  test('hides whats new for first-time users in acceptance mode', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    expect(screen.getByText(/Last updated May 22, 2026/u)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(/What's new in version/u)).not.toBeInTheDocument();
  });

  test('hides whats new in view-only mode but shows version date', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} viewOnly onClose={onCloseMock} />);
    expect(screen.getByText(/Version 1\.2\.0 — Last updated May 22, 2026/u)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(/What's new in version/i)).not.toBeInTheDocument();
  });

  test('enables accept button when checkbox is checked', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(screen.getByText('Accept & Continue')).toBeEnabled();
  });

  test('calls onAccept and updates localStorage when accepted', () => {
    render(<PrivacyPolicyModal onAccept={onAcceptMock} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    const acceptButton = screen.getByText('Accept & Continue');
    fireEvent.click(acceptButton);

    expect(onAcceptMock).toHaveBeenCalled();
    expect(localStorage.getItem('gfc-privacy-policy-accepted')).toBe('1.2.0');
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
