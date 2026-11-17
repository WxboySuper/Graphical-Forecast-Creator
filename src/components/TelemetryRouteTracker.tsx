import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { pageNameForPath, trackEvent, useTelemetryConsent } from '../lib/telemetry';

/** Sends a page-name event without the route path or query data. */
export function TelemetryRouteTracker() {
  const location = useLocation();
  const [consent] = useTelemetryConsent();

  useEffect(() => {
    trackEvent('page_view', pageNameForPath(location.pathname));
  }, [consent, location.pathname]);

  return null;
}
