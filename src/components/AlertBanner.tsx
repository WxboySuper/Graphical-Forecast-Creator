import { useEffect, useState } from 'react';
import { AlertBannerLink } from './AlertBannerLink';
import './AlertBanner.css';

export interface AlertConfig {
  enabled: boolean;
  message: string;
  type: 'info' | 'warning' | 'error';
  dismissible: boolean;
  linkUrl?: string;
  linkLabel?: string;
}

const DEFAULT_CONFIG: AlertConfig = {
  enabled: false,
  message: '',
  type: 'info',
  dismissible: true,
};

interface AlertBannerProps {
  configPath?: string;
}

/** Loads a static JSON banner config and renders a site-wide alert when enabled. */
export function AlertBanner({ configPath = '/alert-banner.json' }: AlertBannerProps) {
  const [config, setConfig] = useState<AlertConfig>(DEFAULT_CONFIG);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(configPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Banner config unavailable');
        }
        return response.json();
      })
      .then((data: AlertConfig) => {
        setConfig(data);
        setDismissed(false);
      })
      .catch(() => {
        // Invalid or missing config should fail closed and keep the banner hidden.
      });
  }, [configPath]);

  if (!config.enabled || dismissed) {
    return null;
  }

  const linkUrl = config.linkUrl?.trim();
  const linkLabel = config.linkLabel?.trim() || 'Learn more';

  return (
    <div className={`alert-banner alert-banner--${config.type}`} role="status" aria-live="polite">
      <div className="alert-banner__content">
        <span className="alert-banner__message">{config.message}</span>
        {linkUrl ? <AlertBannerLink linkUrl={linkUrl} linkLabel={linkLabel} /> : null}
      </div>
      {config.dismissible ? (
        <button
          className="alert-banner__close"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss alert"
          type="button"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}

export default AlertBanner;
