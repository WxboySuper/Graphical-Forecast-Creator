/**
 * Sign-in page layout for the Clerk auth provider: a short GFC introduction beside Clerk's own
 * sign-in or sign-up card, themed to match the app in light and dark mode.
 */
import React, { useEffect, useState } from 'react';
import { CloudUpload, KeyRound, Settings2, UserCheck } from 'lucide-react';
import { GoogleOneTap, SignIn, SignUp } from '../../auth/clerkUiAdapter';
import './ClerkAuthLayout.css';

export type ClerkAuthMode = 'sign_in' | 'sign_up';

/** Tracks the app's dark-mode class, which AppLayout sets on <html>. */
const useDocumentDarkMode = (): boolean => {
  const read = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark-mode');
  const [dark, setDark] = useState(read);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
};

/** GFC light and dark palettes (darkMode.css) in the roles Clerk's appearance API uses. */
const PALETTES = {
  light: {
    primary: '#007bff', background: '#ffffff', text: '#212529', muted: '#495057', subtle: '#f8f9fa',
    input: '#ffffff', border: '#6c757d',
  },
  dark: {
    primary: '#2563eb', background: '#202020', text: '#e4e4e4', muted: '#a3a3a3', subtle: '#2a2a2a',
    input: '#2d2d2d', border: '#737373',
  },
} as const;

/** Clerk theme for the current GFC palette. */
const clerkAppearance = (dark: boolean) => {
  const p = dark ? PALETTES.dark : PALETTES.light;
  return {
    variables: {
      colorPrimary: p.primary,
      colorBackground: p.background,
      colorText: p.text,
      colorTextSecondary: p.muted,
      colorInputBackground: p.input,
      colorInputText: p.text,
      colorNeutral: p.text,
      // Current Clerk names for the same roles; the older names above cover earlier clerk-js builds.
      colorForeground: p.text,
      colorMutedForeground: p.muted,
      colorMuted: p.subtle,
      colorInput: p.input,
      colorInputForeground: p.text,
      // Clerk draws borders from this colour at reduced opacity, so it needs more contrast than --border-color.
      colorBorder: p.border,
      colorPrimaryForeground: '#ffffff',
      colorRing: p.primary,
      borderRadius: '0.7rem',
      fontFamily: 'inherit',
    },
    elements: {
      rootBox: { width: '100%' },
      cardBox: { width: '100%', maxWidth: 'none', boxShadow: 'none', border: 'none', borderRadius: '0' },
      card: { boxShadow: 'none', border: 'none', borderRadius: '0', background: 'transparent' },
      footer: { background: 'transparent' },
      formButtonPrimary: { backgroundColor: p.primary, backgroundImage: 'none', color: '#ffffff' },
      // Switching between sign-in and sign-up happens in the GFC control above the card.
      footerAction: { display: 'none' },
    },
  };
};

const PERKS = [
  { icon: Settings2, title: 'Settings that follow you', text: 'Your GFC settings sync to any device you sign in on.' },
  { icon: UserCheck, title: 'Bring your existing account', text: 'Use the email you used before. Your plan, settings, and cloud-saved forecasts come with you on your first sign-in.' },
  { icon: CloudUpload, title: 'Premium cloud saves', text: 'With Premium, save forecast cycles to the cloud and open them anywhere. Forecasts saved in this browser stay on this device.' },
] as const;

interface ClerkAuthLayoutProps {
  title: string;
  description: string;
  allowSignUp: boolean;
  mode: ClerkAuthMode;
  isBusy: boolean;
  routingInProgress: boolean;
  verificationInProgress: boolean;
  redirectUrl?: string;
  signUpUrl?: string;
  error?: string | null;
  onSelectMode: (mode: ClerkAuthMode) => void;
  onRestart: () => void;
}

/** Sign in / Create account switch shown above the Clerk card. */
const ModeSwitch: React.FC<Pick<ClerkAuthLayoutProps, 'mode' | 'isBusy' | 'routingInProgress' | 'onSelectMode'>> = ({
  mode, isBusy, routingInProgress, onSelectMode,
}) => (
  <div className="gfc-auth__switch" role="group" aria-label="Choose account action">
    {(['sign_in', 'sign_up'] as const).map((value) => (
      <button
        key={value}
        type="button"
        className="gfc-auth__switch-option"
        aria-pressed={mode === value}
        disabled={isBusy || routingInProgress}
        onClick={() => onSelectMode(value)}
      >
        {value === 'sign_in' ? 'Sign in' : 'Create account'}
      </button>
    ))}
  </div>
);

/** Page heading beside the Clerk card. */
const AuthHeading: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="gfc-auth__heading">
    <p className="gfc-auth__eyebrow">Graphical Forecast Creator</p>
    <h2 id="gfc-auth-title" className="gfc-auth__title">{title}</h2>
    <p className="gfc-auth__lede">{description}</p>
  </div>
);

/** What an account gives you and how existing accounts carry over. */
const AuthDetails: React.FC<{ allowSignUp: boolean }> = ({ allowSignUp }) => (
  <div className="gfc-auth__details">
    <ul className="gfc-auth__perks">
      {PERKS.map(({ icon: Icon, title: perkTitle, text }) => (
        <li key={perkTitle} className="gfc-auth__perk">
          <span className="gfc-auth__perk-icon" aria-hidden="true"><Icon /></span>
          <span>
            <strong>{perkTitle}</strong>
            <span className="gfc-auth__perk-text">{text}</span>
          </span>
        </li>
      ))}
    </ul>
    {allowSignUp ? (
      <p className="gfc-auth__note">
        <KeyRound aria-hidden="true" />
        <span>
          Signed in with an email and password before? Choose <strong>Create account</strong> with that same email to set a new password. Google sign-in works as it always has.
        </span>
      </p>
    ) : null}
  </div>
);

/** Two-column sign-in page built around Clerk's card. */
const ClerkAuthLayout: React.FC<ClerkAuthLayoutProps> = ({
  title, description, allowSignUp, mode, isBusy, routingInProgress, verificationInProgress,
  redirectUrl, signUpUrl, error, onSelectMode, onRestart,
}) => {
  const appearance = clerkAppearance(useDocumentDarkMode());
  return (
    <section className="gfc-auth" aria-labelledby="gfc-auth-title">
      <AuthHeading title={title} description={description} />
      <div className="gfc-auth__panel">
        {allowSignUp ? <GoogleOneTap signInForceRedirectUrl={redirectUrl} signUpForceRedirectUrl={redirectUrl} /> : null}
        {allowSignUp ? <ModeSwitch mode={mode} isBusy={isBusy} routingInProgress={routingInProgress} onSelectMode={onSelectMode} /> : null}
        {routingInProgress ? (
          <div className="gfc-auth__notice">
            <p role="status">{verificationInProgress ? 'Finish verification before switching account actions.' : 'A sign-in route is still active.'}</p>
            <button type="button" className="gfc-auth__link-button" onClick={onRestart}>Restart sign-in</button>
          </div>
        ) : null}
        <div className="gfc-auth__clerk">
          {mode === 'sign_up' && allowSignUp ? (
            <SignUp routing="hash" signInUrl={redirectUrl} forceRedirectUrl={redirectUrl} appearance={appearance} />
          ) : (
            <SignIn routing="hash" signUpUrl={allowSignUp ? signUpUrl : undefined} forceRedirectUrl={redirectUrl} appearance={appearance} />
          )}
        </div>
        {error ? <div className="gfc-auth__error" role="alert">{error}</div> : null}
      </div>
      <AuthDetails allowSignUp={allowSignUp} />
    </section>
  );
};

export default ClerkAuthLayout;
