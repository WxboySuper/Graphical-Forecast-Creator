import React, { useMemo } from 'react';
import { CloudSun, Pause, Play, Radar, RefreshCcw, Satellite, Shapes } from 'lucide-react';
import { Button } from '../ui/button';
import type { MonitorOutlookSourceOption } from '../../monitor/outlookSources';
import type { RadarSiteOption } from '../../monitor/radarSites';
import { getRadarProductsForMode, SATELLITE_PRODUCTS } from '../../monitor/wms';
import type { MonitorOutlookSourceSelection, MonitorSettings } from '../../monitor/types';

interface MonitorControlsProps {
  settings: MonitorSettings;
  outlookOptions: MonitorOutlookSourceOption[];
  selectedOutlook: MonitorOutlookSourceOption;
  radarSiteOptions: RadarSiteOption[];
  radarSitesLoading?: boolean;
  radarSitesError?: string;
  radarLatestTime?: string;
  satelliteLatestTime?: string;
  statusMessage: string;
  syncLabel: string;
  onRadarModeChange: (mode: MonitorSettings['radarMode']) => void;
  onRadarProductChange: (product: MonitorSettings['radarProduct']) => void;
  onRadarSiteChange: (site: string) => void;
  onRadarOpacityChange: (opacity: number) => void;
  onSatelliteProductChange: (product: MonitorSettings['satelliteProduct']) => void;
  onSatelliteOpacityChange: (opacity: number) => void;
  onOutlookSourceChange: (source: MonitorOutlookSourceSelection) => void;
  onAnimationEnabledChange: (enabled: boolean) => void;
  onAnimationSpeedChange: (speed: number) => void;
  onRefresh: () => void;
}

const formatLayerTime = (time?: string): string => {
  if (!time) {
    return 'Latest time unavailable';
  }

  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) {
    return time;
  }

  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
};

const sourceValue = (source: MonitorOutlookSourceSelection): string => `${source.kind}:${source.id}`;

const parseSourceValue = (value: string): MonitorOutlookSourceSelection => {
  const [kind, ...idParts] = value.split(':');
  const id = idParts.join(':') || 'current';
  if (kind === 'local-cycle' || kind === 'cloud-cycle' || kind === 'current') {
    return { kind, id };
  }

  return { kind: 'current', id: 'current' };
};

const MonitorControls: React.FC<MonitorControlsProps> = ({
  settings,
  outlookOptions,
  selectedOutlook,
  radarSiteOptions,
  radarSitesLoading,
  radarSitesError,
  radarLatestTime,
  satelliteLatestTime,
  statusMessage,
  syncLabel,
  onRadarModeChange,
  onRadarProductChange,
  onRadarSiteChange,
  onRadarOpacityChange,
  onSatelliteProductChange,
  onSatelliteOpacityChange,
  onOutlookSourceChange,
  onAnimationEnabledChange,
  onAnimationSpeedChange,
  onRefresh,
}) => {
  const radarProducts = useMemo(
    () => getRadarProductsForMode(settings.radarMode),
    [settings.radarMode]
  );
  const selectedSite = radarSiteOptions.find((site) => site.id === settings.radarSite);

  return (
    <aside className="monitor-controls" aria-label="Monitor controls">
      <div className="monitor-controls__header">
        <div>
          <h1>Monitor</h1>
          <p>{statusMessage}</p>
        </div>
        <Button type="button" size="icon-sm" variant="outline" onClick={onRefresh} aria-label="Refresh live layers">
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>

      <section className="monitor-controls__section">
        <h2><Radar className="h-4 w-4" /> Radar</h2>
        <label>
          Source
          <select
            aria-label="Radar source"
            value={settings.radarMode}
            onChange={(event) => onRadarModeChange(event.target.value as MonitorSettings['radarMode'])}
          >
            <option value="none">Off</option>
            <option value="mrms-conus">MRMS CONUS</option>
            <option value="site">Single site</option>
          </select>
        </label>

        {settings.radarMode === 'site' ? (
          <label>
            Radar site
            <input
              value={settings.radarSite}
              list="monitor-radar-site-list"
              maxLength={4}
              placeholder="Search KTLX, KOUN…"
              onChange={(event) => onRadarSiteChange(event.target.value.toUpperCase())}
              aria-label="Radar site"
            />
            <datalist id="monitor-radar-site-list">
              {radarSiteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </datalist>
            <div className="monitor-controls__meta">
              {radarSitesLoading && 'Loading radar sites…'}
              {!radarSitesLoading && radarSitesError}
              {!radarSitesLoading && !radarSitesError && (selectedSite?.label ?? 'Enter a four-character site ID (e.g. KTLX).')}
            </div>
          </label>
        ) : null}

        {settings.radarMode !== 'none' ? (
          <label>
            Product
            <select
              aria-label="Radar product"
              value={settings.radarProduct}
              onChange={(event) => onRadarProductChange(event.target.value as MonitorSettings['radarProduct'])}
            >
              {radarProducts.map((product) => (
                <option key={product.value} value={product.value}>
                  {product.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {settings.radarMode !== 'none' ? (
          <label>
            Opacity
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.radarOpacity}
              onChange={(event) => onRadarOpacityChange(Number(event.target.value))}
            />
          </label>
        ) : null}

        {settings.radarMode !== 'none' ? (
          <div className="monitor-controls__meta">{formatLayerTime(radarLatestTime)}</div>
        ) : null}
      </section>

      <section className="monitor-controls__section">
        <h2><Satellite className="h-4 w-4" /> Satellite</h2>
        <label>
          Product
          <select
            aria-label="Satellite product"
            value={settings.satelliteProduct}
            onChange={(event) => onSatelliteProductChange(event.target.value as MonitorSettings['satelliteProduct'])}
          >
            {SATELLITE_PRODUCTS.map((product) => (
              <option key={product.value} value={product.value}>
                {product.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Opacity
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.satelliteOpacity}
            onChange={(event) => onSatelliteOpacityChange(Number(event.target.value))}
          />
        </label>
        <div className="monitor-controls__meta">{formatLayerTime(satelliteLatestTime)}</div>
      </section>

      <section className="monitor-controls__section">
        <h2><Shapes className="h-4 w-4" /> Outlooks</h2>
        <label>
          Source
          <select
            aria-label="Outlook source"
            value={sourceValue(selectedOutlook)}
            onChange={(event) => onOutlookSourceChange(parseSourceValue(event.target.value))}
          >
            {outlookOptions.map((option) => (
              <option key={`${option.kind}:${option.id}`} value={sourceValue(option)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="monitor-controls__meta">{selectedOutlook.status || `Cycle ${selectedOutlook.cycleDate}`}</div>
      </section>

      <section className="monitor-controls__section">
        <h2><CloudSun className="h-4 w-4" /> Playback</h2>
        <div className="monitor-controls__buttonRow">
          <Button
            type="button"
            size="sm"
            variant={settings.animationEnabled ? 'secondary' : 'outline'}
            onClick={() => onAnimationEnabledChange(!settings.animationEnabled)}
          >
            {settings.animationEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {settings.animationEnabled ? 'Pause' : 'Play'}
          </Button>
          <span>{syncLabel}</span>
        </div>
        <label>
          Speed
          <input
            type="range"
            min="250"
            max="3000"
            step="250"
            value={settings.animationSpeedMs}
            onChange={(event) => onAnimationSpeedChange(Number(event.target.value))}
          />
        </label>
      </section>
    </aside>
  );
};

export default MonitorControls;
