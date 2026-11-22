/**
 * Sends the browser to a page that lives outside the app, such as the pricing
 * and release-notes pages on the marketing site. It keeps old in-app links and
 * bookmarks working and renders a plain link while the navigation happens.
 */
import React, { useEffect } from 'react';

interface ExternalRedirectProps {
  to: string;
  label: string;
  /** Navigation hook so tests can observe the redirect; defaults to replacing the location. */
  navigate?: (url: string) => void;
}

const replaceLocation = (url: string): void => window.location.replace(url);

/** Replaces the current history entry with an external URL. */
export const ExternalRedirect: React.FC<ExternalRedirectProps> = ({ to, label, navigate = replaceLocation }) => {
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);

  return (
    <div className="flex h-full items-center justify-center p-6" role="status" aria-live="polite">
      <a className="text-sm text-muted-foreground underline" href={to}>
        Continue to {label}
      </a>
    </div>
  );
};
