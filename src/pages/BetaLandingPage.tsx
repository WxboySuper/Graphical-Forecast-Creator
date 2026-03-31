import React from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, LogOut } from 'lucide-react';
import BetaAuthCard from '../components/Beta/BetaAuthCard';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../auth/AuthProvider';
import { isBetaModeEnabled } from '../lib/betaAccess';
import './BetaAccess.css';

/** Public landing page shown when the locked beta deployment blocks app access. */
const BetaLandingPage: React.FC = () => {
  const { betaAccess, betaAccessLoading, hostedAuthEnabled, signOutUser, status, user } = useAuth();

  if (!isBetaModeEnabled()) {
    return <Navigate to="/" replace />;
  }

  if (hostedAuthEnabled && status === 'signed_in' && betaAccessLoading) {
    return (
      <div className="beta-page-shell">
        <div className="beta-page-layout">
          <Card className="beta-info-card">
            <CardHeader className="beta-info-card-header">
              <CardTitle>Checking beta access</CardTitle>
              <CardDescription>Verifying whether this account is enrolled in the closed beta.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (hostedAuthEnabled && status === 'signed_in' && betaAccess) {
    return <Navigate to="/" replace />;
  }

  /** Signs the current user out from the locked beta landing page. */
  const handleSignOutClick = () => {
    signOutUser().catch(() => {
      // Shared auth state surfaces sign-out failures.
    });
  };

  return (
    <div className="beta-page-shell">
      <div className="beta-page-layout">
        <section className="beta-hero">
          <div className="beta-pill">
            <Lock className="h-4 w-4" />
            Closed Beta
          </div>

          <div className="beta-hero-grid">
            <div className="beta-hero-copy">
              <h1>Closed beta sign-in</h1>
              <p>
                Beta access is limited to invited accounts. Sign in here if your account has already been activated,
                or use the private onboarding link from Discord first.
              </p>
            </div>

            {status === 'signed_in' ? (
              <Card className="beta-info-card">
                <CardHeader className="beta-info-card-header">
                  <CardTitle>This account is not enrolled yet</CardTitle>
                  <CardDescription>
                    Signed in as {user?.email ?? 'this account'}, but beta access has not been activated.
                  </CardDescription>
                </CardHeader>
                <CardContent className="beta-info-card-content">
                  <div className="beta-status-box">
                    <strong>Need access?</strong>
                    <span>Open the private beta invite link from Discord while signed into the account you want to use.</span>
                  </div>
                  <div className="beta-cta-row">
                    <Button variant="outline" onClick={handleSignOutClick}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <BetaAuthCard
                title="Tester sign in"
                description="Sign in with the account that already has beta access. New testers should use the private invite link first."
                googleLabel="Sign In with Google"
              />
            )}
          </div>
        </section>

        <div className="beta-info-grid">
          <Card className="beta-info-card">
            <CardHeader className="beta-info-card-header">
              <CardTitle className="text-2xl">Access notes</CardTitle>
              <CardDescription>How the locked beta works.</CardDescription>
            </CardHeader>
            <CardContent className="beta-info-card-content">
              <ul>
                <li>Use the private invite link once to activate the account you want to keep using.</li>
                <li>After activation, normal sign-in here is enough. The invite link is not needed again.</li>
                <li>Premium access is being granted manually during beta for cloud and subscription testing.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="beta-info-card">
            <CardHeader className="beta-info-card-header">
              <CardTitle className="text-2xl">Need help?</CardTitle>
              <CardDescription>Quick reminders before you make another account.</CardDescription>
            </CardHeader>
            <CardContent className="beta-info-card-content">
              <p className="beta-note">
                If the wrong account was activated, sign out first and reopen the invite link. If you need another
                invite, ask in the beta Discord channel instead of creating duplicates.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BetaLandingPage;
