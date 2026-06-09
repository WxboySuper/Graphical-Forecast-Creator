import { shouldTrack } from './analyticsUtils';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

/** Measurement ID baked in at build time (e.g. G-44J5RQTQDB for gfc.weatherboysuper.com). */
export const getGoogleAnalyticsMeasurementId = (): string =>
  __GFC_GA_MEASUREMENT_ID__.trim();

/**
 * Loads gtag.js and configures the property. No-op on localhost or when the ID is unset.
 */
export const initGoogleAnalytics = (hostname?: string): void => {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const measurementId = getGoogleAnalyticsMeasurementId();
  if (!measurementId || !shouldTrack(hostname)) {
    return;
  }

  initialized = true;
  window.dataLayer = window.dataLayer ?? [];

  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  window.gtag('js', new Date());
  window.gtag('config', measurementId);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
};

/**
 * Records a SPA navigation in Google Analytics (page_path only).
 */
export const trackGoogleAnalyticsPageView = (pagePath: string, hostname?: string): void => {
  const measurementId = getGoogleAnalyticsMeasurementId();
  if (!measurementId || !shouldTrack(hostname)) {
    return;
  }

  if (!initialized) {
    initGoogleAnalytics(hostname);
  }

  try {
    window.gtag?.('config', measurementId, { page_path: pagePath });
  } catch {
    // Never throw — analytics must not break the app.
  }
};
