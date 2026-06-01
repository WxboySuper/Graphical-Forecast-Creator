import { useEffect, useState } from 'react';
import {
  DEFAULT_ALERT_BANNER_CONFIG,
  isAlertBannerScheduleActive,
  normalizeAlertBannerConfig,
  type AlertBannerConfig,
} from './alertBannerConfig';

const SCHEDULE_POLL_MS = 60_000;

/** Loads banner JSON and tracks whether the active schedule window includes now. */
export function useAlertBanner(configPath: string) {
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

    const syncSchedule = () => {
      setScheduleActive(isAlertBannerScheduleActive(config));
    };

    syncSchedule();
    const intervalId = window.setInterval(syncSchedule, SCHEDULE_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [config]);

  const visible = scheduleActive && !dismissed && config.message.trim().length > 0;

  return {
    config,
    visible,
    dismiss: () => setDismissed(true),
  };
}
