import { useEffect, useState } from 'react';
import {
  DEFAULT_ALERT_BANNER_CONFIG,
  normalizeAlertBannerConfig,
  type AlertBannerConfig,
} from './alertBannerConfig';

/** Loads alert banner JSON from the given public path. */
export function useAlertBanner(configPath: string) {
  const [config, setConfig] = useState<AlertBannerConfig>(DEFAULT_ALERT_BANNER_CONFIG);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(configPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Banner config unavailable');
        }
        return response.json();
      })
      .then((data: unknown) => {
        if (!active) return;
        setConfig(normalizeAlertBannerConfig(data));
        setDismissed(false);
      })
      .catch(() => {
        // Invalid or missing config should fail closed and keep the banner hidden.
      });
    return () => {
      active = false;
    };
  }, [configPath]);

  return { config, dismissed, dismiss: () => setDismissed(true) };
}
