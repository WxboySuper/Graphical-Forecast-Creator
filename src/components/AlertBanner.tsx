import { useEffect, useState } from 'react';
import { AlertBannerLink } from './AlertBannerLink';
import { useAlertBanner } from './useAlertBanner';
import { isAlertBannerScheduleActive } from './alertBannerConfig';
import './AlertBanner.css';

const MAX_TIMEOUT_MS = 2_147_483_647;

interface AlertBannerProps {
  configPath?: string;
}

/** Loads static JSON banner config and renders a site-wide alert when enabled and in schedule. */
export function AlertBanner({ configPath = '/alert-banner.json' }: AlertBannerProps) {
  const { config, dismissed, dismiss } = useAlertBanner(configPath);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const boundaryTimes = [config.startsAt, config.expiresAt]
      .map((value) => (value ? Date.parse(value) : Number.NaN))
      .filter((value) => Number.isFinite(value) && value > nowMs);
    const nextBoundaryMs = Math.min(...boundaryTimes);

    if (!Number.isFinite(nextBoundaryMs)) {
      return undefined;
    }

    const delayMs = Math.min(MAX_TIMEOUT_MS, Math.max(0, nextBoundaryMs - Date.now()));
    const timeout = window.setTimeout(() => setNowMs(Date.now()), delayMs);
    return () => window.clearTimeout(timeout);
  }, [config.startsAt, config.expiresAt, nowMs]);

  if (!isAlertBannerScheduleActive(config, nowMs) || dismissed) {
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
        <button className="alert-banner__close" onClick={dismiss} aria-label="Dismiss alert" type="button">
          &times;
        </button>
      ) : null}
    </div>
  );
}

export default AlertBanner;
