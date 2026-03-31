import React, { useEffect, useState } from 'react';
import { Cloud, LoaderCircle, Mail } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { useAuth } from '../../auth/AuthProvider';

type AuthMode = 'sign_in' | 'sign_up';

interface BetaAuthCardProps {
  title: string;
  description: string;
  allowSignUp?: boolean;
  googleLabel?: string;
}

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

    if (allowSignUp && mode === 'sign_up' && password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      if (allowSignUp && mode === 'sign_up') {
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
    <Card className="beta-auth-card">
      <CardHeader className="beta-auth-header">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="beta-auth-content">
        <Button variant="outline" className="w-full justify-center" onClick={handleGoogleSignInClick} disabled={isBusy}>
          <Cloud className="mr-2 h-4 w-4" />
          {googleLabel}
        </Button>

        <div className="beta-auth-divider">
          <div className="h-px flex-1 bg-border" />
          <span>Email / Password</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {allowSignUp ? (
          <div className="beta-auth-mode-toggle">
            <Button variant={mode === 'sign_in' ? 'default' : 'outline'} onClick={() => setMode('sign_in')} disabled={isBusy}>
              Sign In
            </Button>
            <Button variant={mode === 'sign_up' ? 'default' : 'outline'} onClick={() => setMode('sign_up')} disabled={isBusy}>
              Create Account
            </Button>
          </div>
        ) : null}

        <form className="beta-auth-form" onSubmit={handleEmailSubmit}>
          <div className="beta-auth-field">
            <label htmlFor="beta-email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <Input
              id="beta-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={allowSignUp && mode === 'sign_up' ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          </div>

          {allowSignUp && mode === 'sign_up' ? (
            <div className="beta-auth-field">
              <label htmlFor="beta-confirm-password" className="text-sm font-medium text-foreground">
                Confirm Password
              </label>
              <Input
                id="beta-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
          ) : null}

          {formError || error ? <div className="beta-auth-error">{formError ?? error}</div> : null}

          <Button type="submit" disabled={isBusy}>
            {isBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            {allowSignUp && mode === 'sign_up' ? 'Create Beta Account' : 'Sign In with Email'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default BetaAuthCard;

