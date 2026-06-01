import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_ALERT_BANNER_CONFIG,
  isAlertBannerScheduleActive,
  normalizeAlertBannerConfig,
  type AlertBannerConfig,
} from './alertBannerConfig';
import './AlertBanner.css';

interface AlertBannerProps {
  configPath?: string;
}

/** Loads static JSON banner config and renders a site-wide alert when enabled and in schedule. */
export function AlertBanner({ configPath = '/alert-banner.json' }: AlertBannerProps) {
  const [config, setConfig] = useState<AlertBannerConfig>(DEFAULT_ALERT_BANNER_CONFIG);
  const [dismissed, setDismissed] = useState(false);
  const [scheduleActive, setScheduleActive] = useState(false);

  useEffect(() => {
    fetch(configPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Banner config unavailable');
        }
        return response.json();
      })
      .then((data: unknown) => {
        const next = normalizeAlertBannerConfig(data);
        setConfig(next);
        setDismissed(false);
        setScheduleActive(isAlertBannerScheduleActive(next));
      })
      .catch(() => {
        // Invalid or missing config should fail closed and keep the banner hidden.
      });
  }, [configPath]);

  useEffect(() => {
    if (!config.enabled) {
      setScheduleActive(false);
      return undefined;
    }

    const tick = () => {
      setScheduleActive(isAlertBannerScheduleActive(config));
    };

    tick();
    const intervalId = window.setInterval(tick, 60_000);
    return () => window.clearInterval(intervalId);
  }, [config]);

  if (!scheduleActive || dismissed || !config.message.trim()) {
    return null;
  }

  const isInternalLink = config.linkUrl?.startsWith('/');
  const linkLabel = config.linkLabel?.trim() || 'Learn more';

  return (
    <div className={`alert-banner alert-banner--${config.type}`} role="status" aria-live="polite">
      <div className="alert-banner__content">
        <span className="alert-banner__message">{config.message}</span>
        {config.linkUrl ? (
          isInternalLink ? (
            <Link className="alert-banner__link" to={config.linkUrl}>
              {linkLabel}
            </Link>
          ) : (
            <a className="alert-banner__link" href={config.linkUrl} rel="noopener noreferrer">
              {linkLabel}
            </a>
          )
        ) : null}
      </div>
      {config.dismissible ? (
        <button
          className="alert-banner__close"
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss alert"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}

export default AlertBanner;
