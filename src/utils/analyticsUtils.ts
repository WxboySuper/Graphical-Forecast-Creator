/**
 * Fire-and-forget page view tracking.
 * No-ops silently in dev (localhost) and never throws — analytics must not break the app.
 */
export const trackPageView = (): void => {
  if (
    typeof window === 'undefined' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    return;
  }

  const payload = JSON.stringify({
    page: window.location.pathname,
    referrer: document.referrer,
  });

  try {
    if (typeof navigator.sendBeacon === 'function') {
      // sendBeacon is the preferred method — works even if the page is unloading
      navigator.sendBeacon(
        '/api/collect',
        new Blob([payload], { type: 'application/json' }),
      );
    } else {
      // Fallback for older browsers
      void fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => { /* ignore */ });
    }
  } catch {
    // Never throw
  }
};
