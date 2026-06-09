import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackGoogleAnalyticsPageView } from '../utils/googleAnalytics';

/** Sends GA4 page_view on route changes (including the initial load). */
export function GoogleAnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    const pagePath = `${location.pathname}${location.search}`;
    trackGoogleAnalyticsPageView(pagePath);
  }, [location.pathname, location.search]);

  return null;
}
