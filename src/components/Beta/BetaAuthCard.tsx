import React, { useEffect, useState } from 'react';
import { Cloud, LoaderCircle, Mail } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useAuth } from '../../auth/AuthProvider';
import { BetaInfoCard } from './BetaPageLayout';

type AuthMode = 'sign_in' | 'sign_up';

interface BetaAuthCardProps {
  title: string;
  description: string;
  allowSignUp?: boolean;
  googleLabel?: string;
}

/** True when the current form state is in create-account mode. */
const isCreateAccountMode = (allowSignUp: boolean, mode: AuthMode): boolean =>
  allowSignUp && mode === 'sign_up';

/** Returns the validation error for the email/password form, if any. */
const getEmailSubmitError = (opts: {
  allowSignUp: boolean;
  mode: AuthMode;
  password: string;
  confirmPassword: string;
}): string | null => {
  if (!isCreateAccountMode(opts.allowSignUp, opts.mode)) {
    return null;
  }

  return opts.password === opts.confirmPassword ? null : 'Passwords do not match.';
};

/** Shared hosted-auth card used by the locked beta landing and the invite onboarding flow. */
const BetaAuthModeToggle: React.FC<{
  isBusy: boolean;
  mode: AuthMode;
  onSelectMode: (mode: AuthMode) => void;
}> = ({ isBusy, mode, onSelectMode }) => (
  <div className="beta-auth-mode-toggle">
    <Button variant={mode === 'sign_in' ? 'default' : 'outline'} onClick={() => onSelectMode('sign_in')} disabled={isBusy}>
      Sign In
    </Button>
    <Button variant={mode === 'sign_up' ? 'default' : 'outline'} onClick={() => onSelectMode('sign_up')} disabled={isBusy}>
      Create Account
    </Button>
  </div>
);

/** Main content body for the beta auth card. */
const BetaAuthCardBody: React.FC<{
  allowSignUp: boolean;
  confirmPassword: string;
  email: string;
  error: string | null;
  formError: string | null;
  googleLabel: string;
  isBusy: boolean;
  mode: AuthMode;
  password: string;
  onChangeConfirmPassword: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onGoogleSignIn: () => void;
  onSelectMode: (mode: AuthMode) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}> = ({
  allowSignUp,
  confirmPassword,
  email,
  error,
  formError,
  googleLabel,
  isBusy,
  mode,
  password,
  onChangeConfirmPassword,
  onChangeEmail,
  onChangePassword,
  onGoogleSignIn,
  onSelectMode,
  onSubmit,
}) => (
  <div className="beta-auth-content">
    <Button variant="outline" className="w-full justify-center" onClick={onGoogleSignIn} disabled={isBusy}>
      <Cloud className="mr-2 h-4 w-4" />
      {googleLabel}
    </Button>

    <div className="beta-auth-divider">
      <div className="h-px flex-1 bg-border" />
      <span>Email / Password</span>
      <div className="h-px flex-1 bg-border" />
    </div>

    {allowSignUp ? <BetaAuthModeToggle isBusy={isBusy} mode={mode} onSelectMode={onSelectMode} /> : null}

    <form className="beta-auth-form" onSubmit={onSubmit}>
      <div className="beta-auth-field">
        <label htmlFor="beta-email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id="beta-email"
          type="email"
          value={email}
          onChange={(event) => onChangeEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div className="beta-auth-field">
        <label htmlFor="beta-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id="beta-password"
          type="password"
          value={password}
          onChange={(event) => onChangePassword(event.target.value)}
          autoComplete={allowSignUp && mode === 'sign_up' ? 'new-password' : 'current-password'}
          minLength={6}
          required
        />
      </div>

      {isCreateAccountMode(allowSignUp, mode) ? (
        <div className="beta-auth-field">
          <label htmlFor="beta-confirm-password" className="text-sm font-medium text-foreground">
            Confirm Password
          </label>
          <Input
            id="beta-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => onChangeConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
      ) : null}

      {formError || error ? <div className="beta-auth-error">{formError ?? error}</div> : null}

      <Button type="submit" disabled={isBusy}>
        {isBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
        {isCreateAccountMode(allowSignUp, mode) ? 'Create Beta Account' : 'Sign In with Email'}
      </Button>
    </form>
  </div>
);

/** Shared hosted-auth card used by the locked beta landing and the invite onboarding flow. */
const BetaAuthCard: React.FC<BetaAuthCardProps> = ({
  title,
  description,
  allowSignUp = false,
  googleLabel = 'Continue with Google',
}) => {
  const { error, signInWithEmail, signInWithGoogle, signUpWithEmail, status } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isBusy = submitting || status === 'loading';

  useEffect(() => {
    if (!allowSignUp) {
      setMode('sign_in');
      setConfirmPassword('');
      return;
    }

    if (mode === 'sign_in') {
      setConfirmPassword('');
    }
  }, [allowSignUp, mode]);

  /** Submits the email/password form in either sign-in or sign-up mode. */
  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const submitError = getEmailSubmitError({ allowSignUp, mode, password, confirmPassword });
    if (submitError) {
      setFormError(submitError);
      return;
    }

    setSubmitting(true);

    try {
      if (isCreateAccountMode(allowSignUp, mode)) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }

      setPassword('');
      setConfirmPassword('');
    } catch (nextError) {
      setFormError(nextError instanceof Error ? nextError.message : 'Unable to complete that request right now.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Starts the hosted Google sign-in flow. */
  const handleGoogleSignIn = async () => {
    setFormError(null);
    setSubmitting(true);

    try {
      await signInWithGoogle();
    } catch (nextError) {
      setFormError(nextError instanceof Error ? nextError.message : 'Unable to start Google sign-in right now.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Wraps Google sign-in so the JSX stays free of inline promise handling. */
  const handleGoogleSignInClick = () => {
    handleGoogleSignIn().catch(() => {
      // Form feedback is already handled by handleGoogleSignIn.
    });
  };

  return (
    <BetaInfoCard title={title} description={description} className="beta-auth-card">
      <BetaAuthCardBody
        allowSignUp={allowSignUp}
        confirmPassword={confirmPassword}
        email={email}
        error={error}
        formError={formError}
        googleLabel={googleLabel}
        isBusy={isBusy}
        mode={mode}
        password={password}
        onChangeConfirmPassword={setConfirmPassword}
        onChangeEmail={setEmail}
        onChangePassword={setPassword}
        onGoogleSignIn={handleGoogleSignInClick}
        onSelectMode={setMode}
        onSubmit={handleEmailSubmit}
      />
    </BetaInfoCard>
  );
};

export default BetaAuthCard;
