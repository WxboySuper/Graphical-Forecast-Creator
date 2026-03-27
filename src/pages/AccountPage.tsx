import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleUserRound, Cloud, LoaderCircle, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useAuth } from '../auth/AuthProvider';

type AuthMode = 'sign_in' | 'sign_up';

/** Displays a short explanation when hosted accounts are unavailable in the current deployment. */
const DisabledStateCard: React.FC = () => (
  <Card className="border-border bg-card">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-xl">
        <ShieldCheck className="h-5 w-5 text-primary" />
        Hosted Accounts Are Disabled
      </CardTitle>
      <CardDescription>
        This deployment is running in local-only mode. You can still use every core GFC workflow without signing in.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        When hosted auth is configured, this page will offer Google sign-in plus email/password accounts for syncing
        profile and settings data across devices.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Back to Home</Link>
      </Button>
    </CardContent>
  </Card>
);

/** Shows the current signed-in account basics plus the first free synced settings controls. */
const SignedInAccountCard: React.FC = () => {
  const { user, signOutUser, settingsSyncStatus, syncedSettings, updateSyncedSettings } = useAuth();
  const [defaultForecasterName, setDefaultForecasterName] = useState(() => syncedSettings?.defaultForecasterName ?? user?.displayName ?? '');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const providerLabels = useMemo(
    () =>
      (user?.providerData ?? [])
        .map((provider) => {
          switch (provider.providerId) {
            case 'google.com':
              return 'Google';
            case 'password':
              return 'Email / Password';
            default:
              return provider.providerId;
          }
        })
        .filter(Boolean),
    [user]
  );

  useEffect(() => {
    setDefaultForecasterName(syncedSettings?.defaultForecasterName ?? user?.displayName ?? '');
  }, [syncedSettings?.defaultForecasterName, user?.displayName]);

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    setSaveMessage(null);

    try {
      await updateSyncedSettings({
        defaultForecasterName: defaultForecasterName.trim(),
      });
      setSaveMessage('Default forecaster synced.');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Unable to save defaults right now.');
    } finally {
      setSavingDefaults(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2 border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CircleUserRound className="h-5 w-5 text-primary" />
            Account Overview
          </CardTitle>
          <CardDescription>
            This is the Phase 2 foundation shell for hosted accounts, profile sync, and cross-device settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="mt-2 text-sm font-medium text-foreground">{user?.email ?? 'Unavailable'}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Providers</p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {providerLabels.length > 0 ? providerLabels.join(', ') : 'Unavailable'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Settings Sync</p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {settingsSyncStatus === 'synced' && 'Profile and settings sync are active across signed-in sessions.'}
                {settingsSyncStatus === 'syncing' && 'Syncing your account settings...'}
                {settingsSyncStatus === 'error' && 'Settings sync hit an error. Local mode is still safe.'}
                {settingsSyncStatus === 'idle' && 'Waiting to start syncing settings.'}
                {settingsSyncStatus === 'disabled' && 'Hosted sync is disabled for this deployment.'}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">What your account does today</p>
            <p className="text-sm text-muted-foreground">
              Your sign-in now creates a hosted profile, keeps core app preferences in sync, and stores a default
              forecaster byline that can follow you across devices.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Discussion Defaults</p>
            <div className="space-y-2">
              <label htmlFor="default-forecaster-name" className="text-sm text-muted-foreground">
                Default forecaster name
              </label>
              <input
                id="default-forecaster-name"
                type="text"
                value={defaultForecasterName}
                onChange={(e) => setDefaultForecasterName(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="Your name or preferred byline"
                maxLength={100}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => void handleSaveDefaults()} disabled={savingDefaults}>
                {savingDefaults ? <LoaderCircle className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Defaults
              </Button>
              {saveMessage && <p className="text-sm text-muted-foreground">{saveMessage}</p>}
            </div>
          </div>

          <Button variant="outline" onClick={() => void signOutUser()}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Plan & Metrics</CardTitle>
            <CardDescription>Reserved for premium status and user metrics in later phases.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Free account sync is live in Phase 2. Billing and account metrics will land in later v1.4.0 phases.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Hosted Sync Promise</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Signing in adds convenience, not lock-in. Local forecasting, exports, verification, and history remain
              available even when you never create an account.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

/** Allows users to sign in with Google or email/password when hosted auth is enabled. */
const SignInCard: React.FC = () => {
  const { signInWithEmail, signInWithGoogle, signUpWithEmail, error, status } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isBusy = submitting || status === 'loading';

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (mode === 'sign_in') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      setPassword('');
    } catch (nextError) {
      setFormError(nextError instanceof Error ? nextError.message : 'Unable to complete that request right now.');
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2 border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CircleUserRound className="h-5 w-5 text-primary" />
            Sign In to Sync Settings
          </CardTitle>
          <CardDescription>
            Use Google or email/password to keep your profile and app preferences ready across devices without changing
            the local-first forecasting workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full justify-center" onClick={() => void handleGoogleSignIn()} disabled={isBusy}>
            <Cloud className="h-4 w-4 mr-2" />
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>Email / Password</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <Button variant={mode === 'sign_in' ? 'default' : 'outline'} onClick={() => setMode('sign_in')} disabled={isBusy}>
              Sign In
            </Button>
            <Button variant={mode === 'sign_up' ? 'default' : 'outline'} onClick={() => setMode('sign_up')} disabled={isBusy}>
              Create Account
            </Button>
          </div>

          <form className="space-y-4" onSubmit={handleEmailSubmit}>
            <div className="space-y-2">
              <label htmlFor="account-email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="account-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="account-password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="account-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
                minLength={6}
                required
              />
            </div>

            {(formError || error) && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError ?? error}
              </div>
            )}

            <Button type="submit" disabled={isBusy}>
              {isBusy ? <LoaderCircle className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              {mode === 'sign_in' ? 'Sign In with Email' : 'Create Account'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">What Stays Free</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Forecast creation, local autosave, local history, import/export, discussions, and verification still work
              without any account at all.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">What Sign-In Adds</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Phase 2 starts with identity and account scaffolding so profile sync and cross-device settings can be
              added safely before premium cloud storage arrives.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

/** Account landing page for Phase 2 hosted sign-in and future synced settings. */
const AccountPage: React.FC = () => {
  const { hostedAuthEnabled, status, settingsSyncStatus } = useAuth();

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-7xl mx-auto p-8 space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">Phase 2</p>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Accounts and Settings Sync</h1>
          <p className="max-w-3xl text-base text-muted-foreground leading-relaxed">
            Accounts are optional. This page is the first hosted-service foundation for cross-device continuity, while
            the forecasting experience remains fully usable in local-only mode.
          </p>
          {hostedAuthEnabled && (
            <p className="text-sm text-muted-foreground">
              Current sync status: <span className="font-medium text-foreground">{settingsSyncStatus}</span>
            </p>
          )}
        </div>

        {!hostedAuthEnabled && <DisabledStateCard />}
        {hostedAuthEnabled && status === 'signed_in' && <SignedInAccountCard />}
        {hostedAuthEnabled && status !== 'signed_in' && <SignInCard />}
      </div>
    </div>
  );
};

export default AccountPage;
export { AccountPage };
