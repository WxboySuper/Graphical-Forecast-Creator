import type { MonitorOutlookSourceSelection } from '../../monitor/types';

export const formatLayerTime = (time?: string): string => {
  if (!time) {
    return 'Latest time unavailable';
  }

  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) {
    return time;
  }

  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
};

export const sourceValue = (source: MonitorOutlookSourceSelection): string => `${source.kind}:${source.id}`;

export const parseSourceValue = (value: string): MonitorOutlookSourceSelection => {
  const [kind, ...idParts] = value.split(':');
  const id = idParts.join(':') || 'current';
  if (kind === 'local-cycle' || kind === 'cloud-cycle' || kind === 'current') {
    return { kind, id };
  }

  return { kind: 'current', id: 'current' };
};

export const formatAlertsStatusLine = (
  polygonCount: number,
  frameCount: number,
  frameIndex: number,
): string => {
  const polygonLabel = `${polygonCount} polygon${polygonCount === 1 ? '' : 's'}`;
  if (frameCount <= 1) {
    return polygonLabel;
  }

  return `${polygonLabel} · frame ${frameIndex + 1}/${frameCount}`;
};

export const formatStormReportsStatusLine = (
  shownCount: number,
  totalCount: number,
): string => {
  if (totalCount === shownCount) {
    return `${shownCount} shown today`;
  }

  return `${shownCount} shown (${totalCount} total today)`;
};
