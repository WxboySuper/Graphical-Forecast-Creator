import { useAlertBanner } from './useAlertBanner';
import { AlertBannerLink } from './AlertBannerLink';
import './AlertBanner.css';

interface AlertBannerProps {
  configPath?: string;
}

/** Loads static JSON banner config and renders a site-wide alert when enabled and in schedule. */
export function AlertBanner({ configPath = '/alert-banner.json' }: AlertBannerProps) {
  const { config, visible, dismiss } = useAlertBanner(configPath);

  if (!visible) {
    return null;
  }

  const linkLabel = config.linkLabel?.trim() || 'Learn more';

  return (
    <div className={`alert-banner alert-banner--${config.type}`} role="status" aria-live="polite">
      <div className="alert-banner__content">
        <span className="alert-banner__message">{config.message}</span>
        {config.linkUrl ? <AlertBannerLink linkUrl={config.linkUrl} linkLabel={linkLabel} /> : null}
      </div>
      {config.dismissible ? (
        <button
          className="alert-banner__close"
          type="button"
          onClick={dismiss}
          aria-label="Dismiss alert"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}

export default AlertBanner;
