import { useEffect, useState } from 'react';
import type { AlertConfig } from './AlertBanner';

const DEFAULT_CONFIG: AlertConfig = {
  enabled: false,
  message: '',
  type: 'info',
  dismissible: true,
};

/** Loads alert banner JSON from the given public path. */
export function useAlertBanner(configPath: string) {
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

  return { config, dismissed, dismiss: () => setDismissed(true) };
}
