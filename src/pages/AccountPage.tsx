import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleUserRound, Cloud, LoaderCircle, LogOut, Mail } from 'lucide-react';
import { Badge, type BadgeProps } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../auth/AuthProvider';

type AuthMode = 'sign_in' | 'sign_up';
type SyncStatus = ReturnType<typeof useAuth>['settingsSyncStatus'];

interface SyncStatusMeta {
  label: string;
  variant: BadgeProps['variant'];
}

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

/** Converts the raw settings status into the one compact badge shown on the signed-in account page. */
const getSyncStatusMeta = (settingsSyncStatus: SyncStatus): SyncStatusMeta => {
  switch (settingsSyncStatus) {
    case 'synced':
      return { label: 'Synced', variant: 'success' };
    case 'syncing':
      return { label: 'Syncing', variant: 'secondary' };
    case 'error':
      return { label: 'Needs Attention', variant: 'warning' };
    case 'disabled':
      return { label: 'Local Only', variant: 'outline' };
    case 'idle':
    default:
      return { label: 'Ready', variant: 'secondary' };
  }
};

/** Renders the save button label while optionally showing a loading spinner. */
const renderSaveDefaultsButtonLabel = (savingDefaults: boolean): React.ReactNode => (
  <>
    {savingDefaults ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
    Save Changes
  </>
);

/** Decorative background accents shared by the account hero. */
const AccountHeroBackdrop: React.FC = () => (
  <>
    <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-primary/8 blur-2xl" />
  </>
);

/** Main content stack inside the account hero shell. */
const AccountHeroContent: React.FC<{
  description: string;
  children?: React.ReactNode;
}> = ({ description, children }) => (
  <div className="relative">
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
        <CircleUserRound className="h-4 w-4" />
        Account
      </div>
      <div className="space-y-3">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground md:text-5xl">Account</h1>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">{description}</p>
      </div>
      {children}
    </div>
  </div>
);

/** Shared hero used for signed-in, signed-out, and local-only account states. */
const AccountHero: React.FC<{
  description: string;
  children?: React.ReactNode;
}> = ({ description, children }) => (
  <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-8 md:p-10">
    <AccountHeroBackdrop />
    <AccountHeroContent description={description}>{children}</AccountHeroContent>
  </div>
);

/** Shows the signed-in identity details as compact chips under the account hero. */
const AccountIdentityChips: React.FC<{
  email: string;
  providerLabels: string[];
  statusMeta?: SyncStatusMeta;
}> = ({ email, providerLabels, statusMeta }) => (
  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
    <span className="rounded-full border border-border bg-background/80 px-3 py-1.5 font-medium text-foreground">
      {email}
    </span>
    {providerLabels.map((provider) => (
      <span key={provider} className="rounded-full border border-border bg-background/70 px-3 py-1.5">
        {provider}
      </span>
    ))}
    {statusMeta ? (
      <Badge variant={statusMeta.variant} className="px-3 py-1.5 text-xs uppercase tracking-[0.18em]">
        {statusMeta.label}
      </Badge>
    ) : null}
  </div>
);

/** Small summary tile that keeps the profile card readable and compact. */
const SummaryTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-border/80 bg-muted/25 p-4">
    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
    <p className="mt-3 text-sm font-semibold text-foreground">{value}</p>
  </div>
);

/** Small two-column summary row for the signed-in profile card. */
const ProfileSummaryGrid: React.FC<{
  email: string;
  providerLabels: string[];
}> = ({ email, providerLabels }) => (
  <div className="grid gap-4 md:grid-cols-2">
    <SummaryTile label="Email" value={email} />
    <SummaryTile
      label="Sign-in Method"
      value={providerLabels.length > 0 ? providerLabels.join(', ') : 'Unavailable'}
    />
  </div>
);

/** Editable byline section for the signed-in account card. */
const DiscussionDefaultsSection: React.FC<{
  defaultForecasterName: string;
  setDefaultForecasterName: React.Dispatch<React.SetStateAction<string>>;
}> = ({ defaultForecasterName, setDefaultForecasterName }) => (
  <div className="rounded-2xl border border-border/80 bg-muted/20 p-5">
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">Discussion defaults</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Set the name that should prefill the forecaster field when you write a discussion.
      </p>
    </div>

    <div className="mt-5 space-y-3">
      <label htmlFor="default-forecaster-name" className="text-sm font-medium text-foreground">
        Default forecaster name
      </label>
      <Input
        id="default-forecaster-name"
        type="text"
        value={defaultForecasterName}
        onChange={(e) => setDefaultForecasterName(e.target.value)}
        placeholder="Your name or preferred byline"
        maxLength={100}
      />
    </div>
  </div>
);

/** Bottom action row for saving defaults and ending the current session. */
const SignedInActionRow: React.FC<{
  savingDefaults: boolean;
  saveMessage: string | null;
  onSaveDefaults: () => void;
  onSignOut: () => void;
}> = ({ savingDefaults, saveMessage, onSaveDefaults, onSignOut }) => (
  <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Button onClick={onSaveDefaults} disabled={savingDefaults}>
        {renderSaveDefaultsButtonLabel(savingDefaults)}
      </Button>
      {saveMessage ? <p className="text-sm text-muted-foreground">{saveMessage}</p> : null}
    </div>

    <Button variant="outline" onClick={onSignOut}>
      <LogOut className="mr-2 h-4 w-4" />
      Sign Out
    </Button>
  </div>
);

/** Signed-in primary card with the only profile setting exposed in Phase 2. */
const SignedInPrimaryCard: React.FC<{
  email: string;
  providerLabels: string[];
  defaultForecasterName: string;
  setDefaultForecasterName: React.Dispatch<React.SetStateAction<string>>;
  savingDefaults: boolean;
  saveMessage: string | null;
  onSaveDefaults: () => void;
  onSignOut: () => void;
}> = ({
  email,
  providerLabels,
  defaultForecasterName,
  setDefaultForecasterName,
  savingDefaults,
  saveMessage,
  onSaveDefaults,
  onSignOut,
}) => (
  <Card className="border-border/80 bg-card/95 shadow-sm">
    <CardHeader className="space-y-3">
      <CardTitle className="text-2xl">Profile & Preferences</CardTitle>
      <CardDescription>
        Keep your sign-in details and your default discussion byline ready wherever you open GFC.
      </CardDescription>
      <ProfileSummaryGrid email={email} providerLabels={providerLabels} />
    </CardHeader>

    <CardContent className="space-y-6">
      <DiscussionDefaultsSection
        defaultForecasterName={defaultForecasterName}
        setDefaultForecasterName={setDefaultForecasterName}
      />
      <SignedInActionRow
        savingDefaults={savingDefaults}
        saveMessage={saveMessage}
        onSaveDefaults={onSaveDefaults}
        onSignOut={onSignOut}
      />
    </CardContent>
  </Card>
);

/** Signed-in account experience focused on identity, defaults, and session control. */
const SignedInAccountView: React.FC = () => {
  const { user, signOutUser, settingsSyncStatus, syncedSettings, updateSyncedSettings } = useAuth();
  const [defaultForecasterName, setDefaultForecasterName] = useState(
    () => syncedSettings?.defaultForecasterName ?? user?.displayName ?? ''
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const providerLabels = useMemo(
    () => (user?.providerData ?? []).map((provider) => getProviderLabel(provider.providerId)).filter(Boolean),
    [user]
  );
  const statusMeta = getSyncStatusMeta(settingsSyncStatus);

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
      setSaveMessage('Saved to your account.');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Unable to save right now.');
    } finally {
      setSavingDefaults(false);
    }
  };

  /** Wraps the async save action for a button click without leaking promise handling into JSX. */
  const handleSaveDefaultsClick = () => {
    handleSaveDefaults().catch(() => {
      // Save feedback is already surfaced by handleSaveDefaults.
    });
  };

  /** Wraps sign-out for button usage while shared auth state handles any failure messaging. */
  const handleSignOutClick = () => {
    signOutUser().catch(() => {
      // Auth failures surface through shared auth state.
    });
  };

  return (
    <div className="space-y-8">
      <AccountHero
        description="Keep your profile and app defaults ready across devices while the core forecasting workflow stays yours."
      >
        <AccountIdentityChips
          email={user?.email ?? 'Unavailable'}
          providerLabels={providerLabels}
          statusMeta={statusMeta}
        />
      </AccountHero>

      <SignedInPrimaryCard
        email={user?.email ?? 'Unavailable'}
        providerLabels={providerLabels}
        defaultForecasterName={defaultForecasterName}
        setDefaultForecasterName={setDefaultForecasterName}
        savingDefaults={savingDefaults}
        saveMessage={saveMessage}
        onSaveDefaults={handleSaveDefaultsClick}
        onSignOut={handleSignOutClick}
      />
    </div>
  );
};

/** Shared sign-in header for the signed-out account flow. */
const SignInCardHeader: React.FC = () => (
  <CardHeader className="space-y-3">
    <CardTitle className="text-2xl">Sign in or create an account</CardTitle>
    <CardDescription>
      Keep your profile and app defaults ready across devices. Signing in is optional, and core forecasting stays free.
    </CardDescription>
  </CardHeader>
);

/** Email and password form used for both sign-in and account creation. */
const EmailAuthForm: React.FC<{
  mode: AuthMode;
  email: string;
  password: string;
  confirmPassword: string;
  isBusy: boolean;
  formError: string | null;
  authError: string | null;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onConfirmPasswordChange: (password: string) => void;
  onEmailSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}> = ({
  mode,
  email,
  password,
  confirmPassword,
  isBusy,
  formError,
  authError,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onEmailSubmit,
}) => (
  <div className="space-y-5">
    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
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
        <Input
          id="account-email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="account-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id="account-password"
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
          minLength={6}
          required
        />
      </div>

      {mode === 'sign_up' ? (
        <div className="space-y-2">
          <label htmlFor="account-confirm-password" className="text-sm font-medium text-foreground">
            Confirm Password
          </label>
          <Input
            id="account-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
      ) : null}

      {formError || authError ? (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError ?? authError}
        </div>
      ) : null}

      <Button type="submit" disabled={isBusy}>
        {isBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
        {mode === 'sign_in' ? 'Sign In with Email' : 'Create Account'}
      </Button>
    </form>
  </div>
);

/** Primary signed-out auth card. */
const SignInPrimaryCard: React.FC<{
  isBusy: boolean;
  mode: AuthMode;
  email: string;
  password: string;
  confirmPassword: string;
  formError: string | null;
  authError: string | null;
  onGoogleSignIn: () => void;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onConfirmPasswordChange: (password: string) => void;
  onEmailSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}> = ({
  isBusy,
  mode,
  email,
  password,
  confirmPassword,
  formError,
  authError,
  onGoogleSignIn,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onEmailSubmit,
}) => (
  <Card className="border-border/80 bg-card/95 shadow-sm">
    <SignInCardHeader />
    <CardContent className="space-y-6">
      <Button variant="outline" className="w-full justify-center" onClick={onGoogleSignIn} disabled={isBusy}>
        <Cloud className="mr-2 h-4 w-4" />
        Continue with Google
      </Button>

      <EmailAuthForm
        mode={mode}
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        isBusy={isBusy}
        formError={formError}
        authError={authError}
        onModeChange={onModeChange}
        onEmailChange={onEmailChange}
        onPasswordChange={onPasswordChange}
        onConfirmPasswordChange={onConfirmPasswordChange}
        onEmailSubmit={onEmailSubmit}
      />
    </CardContent>
  </Card>
);

/** Single supporting card for signed-out users so the page stays helpful without turning into marketing clutter. */
const SignedOutSupportCard: React.FC = () => (
  <Card className="border-border/80 bg-card/95 shadow-sm">
    <CardHeader className="space-y-2">
      <CardTitle className="text-lg">What Signing In Helps With</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <li>Keep your map and app preferences ready across devices.</li>
        <li>Store the forecaster name you want prefilled in discussions.</li>
        <li>Use the same account on different machines without changing the local workflow.</li>
      </ul>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Forecasting, discussions, exports, verification, and local history remain available with or without an account.
      </p>
    </CardContent>
  </Card>
);

/** Shared local-only card body used when hosted accounts are disabled. */
const LocalOnlyCard: React.FC = () => (
  <Card className="border-border/80 bg-card/95 shadow-sm">
    <CardHeader className="space-y-2">
      <CardTitle className="text-2xl">Local-only mode</CardTitle>
      <CardDescription>
        Hosted accounts are turned off here, but the full local forecasting workflow is still ready to go.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Forecast drawing, discussions, verification, imports, exports, and local history keep working exactly as
        expected.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Back to Home</Link>
      </Button>
    </CardContent>
  </Card>
);

/** Signed-out account experience focused on a clean auth flow plus one concise reassurance card. */
const SignedOutAccountView: React.FC = () => {
  const { signInWithEmail, signInWithGoogle, signUpWithEmail, error, status } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isBusy = submitting || status === 'loading';

  useEffect(() => {
    if (mode === 'sign_in') {
      setConfirmPassword('');
    }
  }, [mode]);

  /** Handles email/password sign-in or sign-up based on the selected account mode. */
  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (mode === 'sign_up' && password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'sign_in') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
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

  /** Wraps Google sign-in for button usage without inline promise handling in JSX. */
  const handleGoogleSignInClick = () => {
    handleGoogleSignIn().catch(() => {
      // Form feedback is already handled by handleGoogleSignIn.
    });
  };

  return (
    <div className="space-y-8">
      <AccountHero description="Sign in to keep your profile and defaults ready across devices. Core forecasting stays free with or without an account." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SignInPrimaryCard
            isBusy={isBusy}
            mode={mode}
            email={email}
            password={password}
            confirmPassword={confirmPassword}
            formError={formError}
            authError={error}
            onGoogleSignIn={handleGoogleSignInClick}
            onModeChange={setMode}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onEmailSubmit={handleEmailSubmit}
          />
        </div>
        <SignedOutSupportCard />
      </div>
    </div>
  );
};

/** Local-only fallback for deployments where hosted accounts are intentionally disabled. */
const DisabledStateView: React.FC = () => (
  <div className="space-y-8">
    <AccountHero description="This deployment is running in local-only mode. You can still use every core GFC workflow without signing in." />
    <LocalOnlyCard />
  </div>
);

/** Production-facing account page for hosted sign-in, synced defaults, and local-only fallback. */
const AccountPage: React.FC = () => {
  const { hostedAuthEnabled, status } = useAuth();

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
      <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
        {!hostedAuthEnabled ? <DisabledStateView /> : null}
        {hostedAuthEnabled && status === 'signed_in' ? <SignedInAccountView /> : null}
        {hostedAuthEnabled && status !== 'signed_in' ? <SignedOutAccountView /> : null}
      </div>
    </div>
  );
};

export default AccountPage;
export { AccountPage };
