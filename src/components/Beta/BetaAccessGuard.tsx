import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Card, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { useAuth } from '../../auth/AuthProvider';
import { isBetaModeEnabled } from '../../lib/betaAccess';
import '../../pages/BetaAccess.css';

/** Full-app route guard that keeps the beta deployment locked to approved accounts. */
const BetaAccessGuard: React.FC = () => {
  const { betaAccess, betaAccessLoading, hostedAuthEnabled, status } = useAuth();

  if (!isBetaModeEnabled()) {
    return <Outlet />;
  }

  if (!hostedAuthEnabled) {
    return <Navigate to="/" replace />;
  }

  if (status === 'loading' || (status === 'signed_in' && betaAccessLoading)) {
    return (
      <div className="beta-page-shell">
        <div className="beta-page-layout">
          <Card className="beta-info-card">
            <CardHeader className="beta-info-card-header">
              <CardTitle>Checking beta access</CardTitle>
              <CardDescription>Verifying whether this account can enter the closed beta.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (status === 'signed_in' && betaAccess) {
    return <Outlet />;
  }

  return <Navigate to="/beta" replace />;
};

export default BetaAccessGuard;
