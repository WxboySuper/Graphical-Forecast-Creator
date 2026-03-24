import { useState, useEffect } from 'react';
import './AlertBanner.css';

export interface AlertConfig {
  enabled: boolean;
  message: string;
  type: 'info' | 'warning' | 'error';
  dismissible: boolean;
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

export function AlertBanner({ configPath = '/alert-banner.json' }: AlertBannerProps) {
  const [config, setConfig] = useState<AlertConfig>(DEFAULT_CONFIG);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(configPath)
      .then((res) => res.json())
      .then((data: AlertConfig) => setConfig(data))
      .catch(() => {
        // Config file not found or invalid, don't show banner
      });
  }, [configPath]);

  if (!config.enabled || dismissed) {
    return null;
  }

  return (
    <div className={`alert-banner alert-banner--${config.type}`}>
      <span className="alert-banner__message">{config.message}</span>
      {config.dismissible && (
        <button
          className="alert-banner__close"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss alert"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default AlertBanner;
