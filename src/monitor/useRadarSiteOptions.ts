import { useEffect, useState } from 'react';
import type { RadarSiteOption } from './radarSites';
import { fetchRadarSiteOptions } from './radarSites';

export const useRadarSiteOptions = () => {
  const [sites, setSites] = useState<RadarSiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let active = true;

    fetchRadarSiteOptions()
      .then((options) => {
        if (active) {
          setSites(options);
        }
      })
      .catch(() => {
        if (active) {
          setError('Radar site list unavailable.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { sites, loading, error };
};
