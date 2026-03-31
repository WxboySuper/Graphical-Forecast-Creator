import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, LoaderCircle, LockKeyhole } from 'lucide-react';
import BetaAuthCard from '../components/Beta/BetaAuthCard';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../auth/AuthProvider';
import { getBetaInvitePath, isBetaModeEnabled } from '../lib/betaAccess';
import './BetaAccess.css';

/** True when the invite-path segment is valid for the current beta deployment. */
const hasValidInvitePath = (value: string | undefined): boolean =>
  !getBetaInvitePath() || value === getBetaInvitePath();

/** Beta onboarding page reached from the private Discord invite link. */
const BetaInvitePage: React.FC = () => {
  const { betaAccess, betaAccessLoading, hostedAuthEnabled, refreshBetaAccess, status, user } = useAuth();
  const navigate = useNavigate();
  const { invitePath } = useParams();
  const [searchParams] = useSearchParams();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const inviteToken = searchParams.get('t')?.trim() ?? '';
  const inviteLooksValid = useMemo(
    () => Boolean(inviteToken) && hasValidInvitePath(invitePath),
    [invitePath, inviteToken]
  );

  if (!isBetaModeEnabled()) {
    return <Navigate to="/" replace />;
  }

  /** Claims beta access for the current signed-in account via the private server endpoint. */
  const handleClaimAccess = async () => {
    if (!user || !inviteLooksValid) {
      return;
    }

    setClaimError(null);
    setClaiming(true);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/beta/claim', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: inviteToken,
          invitePath: invitePath ?? '',
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Unable to activate beta access right now.');
      }

      await refreshBetaAccess();
      navigate('/', { replace: true });
    } catch (nextError) {
      setClaimError(nextError instanceof Error ? nextError.message : 'Unable to activate beta access right now.');
    } finally {
      setClaiming(false);
    }
  };

  /** Wraps the async beta-claim action for button usage. */
  const handleClaimAccessClick = () => {
    handleClaimAccess().catch(() => {
      // Claim feedback is already surfaced by handleClaimAccess.
    });
  };

  return (
    <div className="beta-page-shell">
      <div className="beta-page-layout">
        <section className="beta-hero">
          <div className="beta-pill">
            <LockKeyhole className="h-4 w-4" />
            Beta Invite
          </div>

          <div className="beta-hero-grid">
            <div className="beta-hero-copy">
              <h1>Activate your beta account</h1>
              <p>
                This invite is the one-time onboarding step for the closed beta. Sign in or create the account you
                want to use, then activate access for that account.
              </p>
            </div>

            {!inviteLooksValid ? (
              <Card className="beta-info-card">
                <CardHeader className="beta-info-card-header">
                  <CardTitle>Invite required</CardTitle>
                  <CardDescription>
                    This onboarding URL is incomplete or invalid. Please use the private invite link shared in the beta Discord.
                  </CardDescription>
                </CardHeader>
                <CardContent className="beta-info-card-content">
                  <Button asChild variant="outline">
                    <Link to="/beta">Back to Beta Sign In</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : status !== 'signed_in' ? (
              <BetaAuthCard
                title="Sign in or create your beta account"
                description="Use the account you want to keep for the beta. After sign-in, this invite will activate access on that account."
                allowSignUp
                googleLabel="Continue with Google"
              />
            ) : betaAccessLoading ? (
              <Card className="beta-info-card">
                <CardHeader className="beta-info-card-header">
                  <CardTitle>Checking current access</CardTitle>
                  <CardDescription>Making sure this account still needs beta activation before we continue.</CardDescription>
                </CardHeader>
              </Card>
            ) : betaAccess ? (
              <Card className="beta-info-card">
                <CardHeader className="beta-info-card-header">
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <CheckCircle2 className="h-5 w-5" />
                    Beta access already active
                  </CardTitle>
                  <CardDescription>
                    {user?.email ?? 'This account'} already has beta access. You can go straight into the beta app now.
                  </CardDescription>
                </CardHeader>
                <CardContent className="beta-info-card-content">
                  <Button asChild>
                    <Link to="/">Enter Beta</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="beta-info-card">
                <CardHeader className="beta-info-card-header">
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <KeyRound className="h-5 w-5" />
                    Activate access for this account
                  </CardTitle>
                  <CardDescription>
                    Signed in as {user?.email ?? 'this account'}. Activate this invite to allow that account into the beta deployment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="beta-info-card-content">
                  <div className="beta-status-box">
                    <strong>Account ready</strong>
                    <span>Once activated, this account can sign in on the beta landing page without using the invite again.</span>
                  </div>
                  {claimError ? <p className="beta-inline-error">{claimError}</p> : null}
                  <div className="beta-cta-row">
                    <Button onClick={handleClaimAccessClick} disabled={claiming}>
                      {claiming ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Activate Beta Access
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/beta">Back to Beta Sign In</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default BetaInvitePage;
