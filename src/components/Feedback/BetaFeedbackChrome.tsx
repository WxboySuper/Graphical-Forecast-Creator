/**
 * Beta-only chrome. Renders the open-beta notice banner and the floating
 * feedback button so feedback stays front and center on beta.gfcweather.com.
 */
import React, { useEffect, useRef, useState } from 'react';
import { FlaskConical, MessageSquarePlus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { DISCORD_INVITE_URL, isBetaBuild, isFeedbackEnabled } from '../../config/feedback';
import { useFeedback } from './FeedbackContext';

const BANNER_DISMISSED_KEY = 'gfc-beta-banner-dismissed';
const BANNER_HEIGHT_VAR = '--beta-banner-height';

/** Publishes the banner's rendered height so viewport-sized workspaces subtract it; resets to 0 on unmount. */
const usePublishBannerHeight = (ref: React.RefObject<HTMLElement | null>, hidden: boolean) => {
  useEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (!element || hidden) {
      root.style.setProperty(BANNER_HEIGHT_VAR, '0px');
      return undefined;
    }
    const publish = () => root.style.setProperty(BANNER_HEIGHT_VAR, `${element.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', publish);
      return () => {
        window.removeEventListener('resize', publish);
        root.style.setProperty(BANNER_HEIGHT_VAR, '0px');
      };
    }
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.setProperty(BANNER_HEIGHT_VAR, '0px');
    };
  }, [ref, hidden]);
};

/** Reads whether the banner was dismissed during this browser session. */
const readDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

/** Slim, per-session dismissible notice marking this deployment as the public beta. */
const BetaBanner: React.FC = () => {
  const { openFeedback } = useFeedback();
  const [dismissed, setDismissed] = useState(readDismissed);
  const bannerRef = useRef<HTMLDivElement>(null);
  usePublishBannerHeight(bannerRef, dismissed);

  if (dismissed) return null;

  /** Hides the banner for the rest of the session. */
  const dismiss = () => {
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
    } catch {
      // Dismissal still applies for this render when storage is unavailable.
    }
    setDismissed(true);
  };

  return (
    <div
      ref={bannerRef}
      role="region"
      aria-label="Beta notice"
      className="flex items-center gap-3 border-b border-border bg-primary/10 px-4 py-1.5 text-sm"
    >
      <FlaskConical className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <strong>GFC Beta.</strong>{' '}
        <span className="text-muted-foreground">
          You are previewing unreleased features. Things may break. Your account and plan work here as usual.
        </span>
      </p>
      {isFeedbackEnabled() ? (
        <Button variant="link" size="sm" className="h-auto p-0" onClick={openFeedback}>
          Send feedback
        </Button>
      ) : null}
      <a
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden text-sm underline-offset-4 hover:underline sm:inline"
      >
        Discord
      </a>
      <button
        type="button"
        aria-label="Dismiss beta notice"
        onClick={dismiss}
        className="rounded p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

/** Always-visible feedback launcher shown only on the beta build. */
const FloatingFeedbackButton: React.FC = () => {
  const { openFeedback } = useFeedback();
  return (
    <Button
      onClick={openFeedback}
      className="fixed bottom-4 left-4 z-panel rounded-full shadow-lg"
      aria-label="Send beta feedback"
    >
      <MessageSquarePlus aria-hidden="true" />
      Feedback
    </Button>
  );
};

/** Beta-only layout chrome; renders nothing on other deployments. */
export const BetaFeedbackBanner: React.FC = () => (isBetaBuild() ? <BetaBanner /> : null);
export const BetaFeedbackButton: React.FC = () =>
  isBetaBuild() && isFeedbackEnabled() ? <FloatingFeedbackButton /> : null;
