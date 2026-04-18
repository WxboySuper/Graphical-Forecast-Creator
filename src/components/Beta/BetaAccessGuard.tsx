import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { isBetaModeEnabled, isLocalBetaBypassEnabled } from '../../lib/betaAccess';
import { BetaStatusPanel } from './BetaPageLayout';

/** True when the beta gate should show an access-check loading state. */
const isCheckingBetaAccess = (
  status: ReturnType<typeof useAuth>['status'],
  betaAccessLoading: boolean
): boolean => {
  if (status === 'loading') {
    return true;
  }

  return status === 'signed_in' ? betaAccessLoading : false;
};

/** Full-app route guard that keeps the beta deployment locked to approved accounts. */
const BetaAccessGuard: React.FC = () => {
  const location = useLocation();
  const { betaAccess, betaAccessLoading, hostedAuthEnabled, status } = useAuth();

  if (!isBetaModeEnabled()) {
    return <Outlet />;
  }

  if (isLocalBetaBypassEnabled(location.search)) {
    return <Outlet />;
  }

  if (!hostedAuthEnabled) {
    return <Navigate to="/beta" replace />;
  }

  if (isCheckingBetaAccess(status, betaAccessLoading)) {
    return (
      <BetaStatusPanel
        title="Checking beta access"
        description="Verifying whether this account can enter the closed beta."
      />
    );
  }

  if (status === 'signed_in' && betaAccess) {
    return <Outlet />;
  }

  return <Navigate to="/beta" replace />;
};

export default BetaAccessGuard;
