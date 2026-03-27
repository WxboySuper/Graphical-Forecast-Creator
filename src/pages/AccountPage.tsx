import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleUserRound, Cloud, LoaderCircle, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useAuth } from '../auth/AuthProvider';

type AuthMode = 'sign_in' | 'sign_up';

/** Maps Firebase provider ids to short labels for the account UI. */
const getProviderLabel = (providerId: string): string => {
  switch (providerId) {
    case 'google.com':
      return 'Google';
    case 'password':
      return 'Email / Password';
    default:
      return providerId;
  }
};

/** Turns the raw sync status enum into copy for the account page. */
const getSettingsSyncCopy = (settingsSyncStatus: ReturnType<typeof useAuth>['settingsSyncStatus']): string => {
  switch (settingsSyncStatus) {
    case 'synced':
      return 'Profile and settings sync are active across signed-in sessions.';
    case 'syncing':
      return 'Syncing your account settings...';
    case 'error':
      return 'Settings sync hit an error. Local mode is still safe.';
    case 'idle':
      return 'Waiting to start syncing settings.';
    case 'disabled':
      return 'Hosted sync is disabled for this deployment.';
    default:
      return '';
  }
};

/** Renders the save button label while optionally showing a loading spinner. */
const renderSaveDefaultsButtonLabel = (savingDefaults: boolean): React.ReactNode => (
  <>
    {savingDefaults ? <LoaderCircle className="h-4 w-4 mr-2 animate-spin" /> : null}
    Save Defaults
  </>
);

/** Handles the small synced discussion-default form used in the signed-in account view. */
const DiscussionDefaultsCard: React.FC<{
  defaultForecasterName: string;
  setDefaultForecasterName: React.Dispatch<React.SetStateAction<string>>;
  savingDefaults: boolean;
  saveMessage: string | null;
  onSave: () => void;
}> = ({ defaultForecasterName, setDefaultForecasterName, savingDefaults, saveMessage, onSave }) => (
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
      <Button variant="outline" onClick={onSave} disabled={savingDefaults}>
        {renderSaveDefaultsButtonLabel(savingDefaults)}
      </Button>
      {saveMessage && <p className="text-sm text-muted-foreground">{saveMessage}</p>}
    </div>
  </div>
);

/** Shows the basic account identity and hosted sync status cards. */
const AccountOverviewGrid: React.FC<{
  email: string;
  providerLabels: string[];
  settingsSyncStatus: ReturnType<typeof useAuth>['settingsSyncStatus'];
}> = ({ email, providerLabels, settingsSyncStatus }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
      <p className="mt-2 text-sm font-medium text-foreground">{email}</p>
    </div>
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Providers</p>
      <p className="mt-2 text-sm font-medium text-foreground">
        {providerLabels.length > 0 ? providerLabels.join(', ') : 'Unavailable'}
      </p>
    </div>
    <div className="rounded-lg border border-border bg-muted/30 p-4 md:col-span-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Settings Sync</p>
      <p className="mt-2 text-sm font-medium text-foreground">{getSettingsSyncCopy(settingsSyncStatus)}</p>
    </div>
  </div>
);

/** Keeps the signed-in account overview card shallow and focused. */
const SignedInPrimaryCard: React.FC<{
  email: string;
  providerLabels: string[];
  settingsSyncStatus: ReturnType<typeof useAuth>['settingsSyncStatus'];
  defaultForecasterName: string;
  setDefaultForecasterName: React.Dispatch<React.SetStateAction<string>>;
  savingDefaults: boolean;
  saveMessage: string | null;
  onSaveDefaults: () => void;
  onSignOut: () => void;
}> = ({
  email,
  providerLabels,
  settingsSyncStatus,
  defaultForecasterName,
  setDefaultForecasterName,
  savingDefaults,
  saveMessage,
  onSaveDefaults,
  onSignOut,
}) => (
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
      <AccountOverviewGrid email={email} providerLabels={providerLabels} settingsSyncStatus={settingsSyncStatus} />

      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">What your account does today</p>
        <p className="text-sm text-muted-foreground">
          Your sign-in now creates a hosted profile, keeps core app preferences in sync, and stores a default
          forecaster byline that can follow you across devices.
        </p>
      </div>

      <DiscussionDefaultsCard
        defaultForecasterName={defaultForecasterName}
        setDefaultForecasterName={setDefaultForecasterName}
        savingDefaults={savingDefaults}
        saveMessage={saveMessage}
        onSave={onSaveDefaults}
      />

      <Button variant="outline" onClick={onSignOut}>
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    </CardContent>
  </Card>
);

/** Contains the signed-in account side cards that explain scope and future phases. */
const SignedInSidebar: React.FC = () => (
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
);

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
    () => (user?.providerData ?? []).map((provider) => getProviderLabel(provider.providerId)).filter(Boolean),
    [user]
  );

  useEffect(() => {
    setDefaultForecasterName(syncedSettings?.defaultForecasterName ?? user?.displayName ?? '');
  }, [syncedSettings?.defaultForecasterName, user?.displayName]);

  /** Saves the discussion default byline into the synced user settings document. */
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

  /** Bridges the async save routine into a plain button click handler. */
  const handleSaveDefaultsClick = () => {
    handleSaveDefaults().catch(() => {
      // Save feedback is already surfaced by handleSaveDefaults.
    });
  };

  /** Wraps the async save action for a button click without leaking promise handling into JSX. */
  const onSaveDefaultsClick = () => {
    handleSaveDefaultsClick();
  };

  /** Wraps sign-out for button usage while shared auth state handles any failure messaging. */
  const handleSignOutClick = () => {
    signOutUser().catch(() => {
      // Auth failures surface through shared auth state.
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <SignedInPrimaryCard
        email={user?.email ?? 'Unavailable'}
        providerLabels={providerLabels}
        settingsSyncStatus={settingsSyncStatus}
        defaultForecasterName={defaultForecasterName}
        setDefaultForecasterName={setDefaultForecasterName}
        savingDefaults={savingDefaults}
        saveMessage={saveMessage}
        onSaveDefaults={onSaveDefaultsClick}
        onSignOut={handleSignOutClick}
      />
      <SignedInSidebar />
    </div>
  );
};

/** Keeps the sign-in primary card shallow while preserving the current auth flow. */
const SignInCardHeader: React.FC = () => (
  <CardHeader>
    <CardTitle className="flex items-center gap-2 text-xl">
      <CircleUserRound className="h-5 w-5 text-primary" />
      Sign In to Sync Settings
    </CardTitle>
    <CardDescription>
      Use Google or email/password to keep your profile and app preferences ready across devices without changing the
      local-first forecasting workflow.
    </CardDescription>
  </CardHeader>
);

/** Renders the email/password form inside the hosted sign-in card. */
const EmailAuthForm: React.FC<{
  mode: AuthMode;
  email: string;
  password: string;
  isBusy: boolean;
  formError: string | null;
  authError: string | null;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onEmailSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}> = ({
  mode,
  email,
  password,
  isBusy,
  formError,
  authError,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onEmailSubmit,
}) => (
  <>
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>Email / Password</span>
      <div className="h-px flex-1 bg-border" />
    </div>

    <div className="flex gap-2">
      <Button variant={mode === 'sign_in' ? 'default' : 'outline'} onClick={() => onModeChange('sign_in')} disabled={isBusy}>
        Sign In
      </Button>
      <Button variant={mode === 'sign_up' ? 'default' : 'outline'} onClick={() => onModeChange('sign_up')} disabled={isBusy}>
        Create Account
      </Button>
    </div>

    <form className="space-y-4" onSubmit={onEmailSubmit}>
      <div className="space-y-2">
        <label htmlFor="account-email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="account-email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
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
          onChange={(e) => onPasswordChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
          minLength={6}
          required
        />
      </div>

      {(formError || authError) && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError ?? authError}
        </div>
      )}

      <Button type="submit" disabled={isBusy}>
        {isBusy ? <LoaderCircle className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
        {mode === 'sign_in' ? 'Sign In with Email' : 'Create Account'}
      </Button>
    </form>
  </>
);

/** Keeps the sign-in primary card shallow while preserving the current auth flow. */
const SignInPrimaryCard: React.FC<{
  isBusy: boolean;
  mode: AuthMode;
  email: string;
  password: string;
  formError: string | null;
  authError: string | null;
  onGoogleSignIn: () => void;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onEmailSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}> = ({
  isBusy,
  mode,
  email,
  password,
  formError,
  authError,
  onGoogleSignIn,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onEmailSubmit,
}) => (
  <Card className="xl:col-span-2 border-border bg-card">
    <SignInCardHeader />
    <CardContent className="space-y-4">
      <Button variant="outline" className="w-full justify-center" onClick={onGoogleSignIn} disabled={isBusy}>
        <Cloud className="h-4 w-4 mr-2" />
        Continue with Google
      </Button>

      <EmailAuthForm
        mode={mode}
        email={email}
        password={password}
        isBusy={isBusy}
        formError={formError}
        authError={authError}
        onModeChange={onModeChange}
        onEmailChange={onEmailChange}
        onPasswordChange={onPasswordChange}
        onEmailSubmit={onEmailSubmit}
      />
    </CardContent>
  </Card>
);

/** Contains the signed-out reassurance cards that explain the free/local-first promise. */
const SignInSidebar: React.FC = () => (
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
          Phase 2 starts with identity and account scaffolding so profile sync and cross-device settings can be added
          safely before premium cloud storage arrives.
        </p>
      </CardContent>
    </Card>
  </div>
);

/** Allows users to sign in with Google or email/password when hosted auth is enabled. */
const SignInCard: React.FC = () => {
  const { signInWithEmail, signInWithGoogle, signUpWithEmail, error, status } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isBusy = submitting || status === 'loading';

  /** Handles email/password sign-in or sign-up based on the selected account mode. */
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

  /** Bridges the async Google sign-in routine into a plain button click handler. */
  const handleGoogleSignInClick = () => {
    handleGoogleSignIn().catch(() => {
      // Form feedback is already handled by handleGoogleSignIn.
    });
  };

  /** Wraps Google sign-in for button usage without inline promise handling in JSX. */
  const onGoogleSignInClick = () => {
    handleGoogleSignInClick();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <SignInPrimaryCard
        isBusy={isBusy}
        mode={mode}
        email={email}
        password={password}
        formError={formError}
        authError={error}
        onGoogleSignIn={onGoogleSignInClick}
        onModeChange={setMode}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onEmailSubmit={handleEmailSubmit}
      />
      <SignInSidebar />
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
