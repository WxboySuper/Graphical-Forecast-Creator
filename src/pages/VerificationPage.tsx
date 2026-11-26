import React, { lazy, Suspense } from 'react';
import { flag } from '../config/flags';
import VerificationMode from '../components/VerificationMode/VerificationMode';
import { RouteFallback } from '../components/ui/RouteFallback';

// Lazily loaded so the Verification v2 dashboard and its grading engine never
// import as a side effect while verificationRelaunch is disabled.
// Verification owns the Turf-backed grading graph; keep it behind this route's lazy boundary.
const ForecastGradeDashboard = lazy(() => import('../components/ForecastGrade/ForecastGradeDashboard'));

/**
 * Routes /verification to the classic VerificationMode by default and to the
 * Forecast Grade dashboard only when verificationRelaunch is exposed on the
 * current build target. Classic remains fully functional when the flag is off.
 */
export const VerificationPage: React.FC = () => {
  if (flag('verificationRelaunch')) {
    return (
      <Suspense fallback={<RouteFallback label="Loading Forecast Grade" />}>
        <ForecastGradeDashboard />
      </Suspense>
    );
  }

  return (
    <>
      <h1 className="sr-only">Forecast Verification</h1>
      <VerificationMode />
    </>
  );
};

export default VerificationPage;
