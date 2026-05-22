import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CloudSun,
  MapPin,
  Pause,
  Play,
  Radar,
  RefreshCcw,
  Satellite,
  Shapes,
} from 'lucide-react';
import type { NwsAlertFeatureCollection } from '../../monitor/nwsAlerts';
import { Button } from '../ui/button';
import type { MonitorOutlookSourceOption } from '../../monitor/outlookSources';
import type { RadarSiteOption } from '../../monitor/radarSites';
import { getRadarProductsForMode, SATELLITE_PRODUCTS } from '../../monitor/wms';
import {
  MONITOR_OUTLOOK_LAYER_LABELS,
  MONITOR_OUTLOOK_LAYER_TYPES,
} from '../../monitor/outlookLayers';
import type { MonitorOutlookLayerType, MonitorOutlookSourceSelection, MonitorSettings } from '../../monitor/types';

interface MonitorStormReportsMeta {
  reports: unknown[];
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  totalCount: number;
}

interface MonitorAlertsMeta {
  alertCollection: NwsAlertFeatureCollection;
  frameCount: number;
  frameIndex: number;
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  polygonCount: number;
}

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
  onOutlookTypeChange: (type: MonitorOutlookLayerType) => void;
  stormReportsMeta: MonitorStormReportsMeta;
  onStormReportsEnabledChange: (enabled: boolean) => void;
  onStormReportsFilterTornadoChange: (enabled: boolean) => void;
  onStormReportsFilterWindChange: (enabled: boolean) => void;
  onStormReportsFilterHailChange: (enabled: boolean) => void;
  onStormReportsMatchOutlookTypeChange: (enabled: boolean) => void;
  alertsMeta: MonitorAlertsMeta;
  onAlertsEnabledChange: (enabled: boolean) => void;
  onAlertsOpacityChange: (opacity: number) => void;
  onAlertsShowWatchesChange: (enabled: boolean) => void;
  onAlertsShowWarningsChange: (enabled: boolean) => void;
  onAlertsShowAdvisoriesChange: (enabled: boolean) => void;
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

interface MonitorControlsSectionProps {
  id: string;
  title: React.ReactNode;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

const MonitorControlsSection: React.FC<MonitorControlsSectionProps> = ({
  id,
  title,
  defaultCollapsed = false,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const panelId = `monitor-controls-panel-${id}`;

  return (
    <section
      className={`monitor-controls__section${collapsed ? ' monitor-controls__section--collapsed' : ''}`}
    >
      <button
        type="button"
        className="monitor-controls__sectionToggle"
        aria-label={`Toggle ${id} controls`}
        aria-expanded={!collapsed}
        aria-controls={panelId}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className="monitor-controls__sectionTitle">{title}</span>
        {collapsed ? (
          <ChevronDown className="monitor-controls__sectionChevron" aria-hidden="true" />
        ) : (
          <ChevronUp className="monitor-controls__sectionChevron" aria-hidden="true" />
        )}
      </button>
      {!collapsed ? (
        <div id={panelId} className="monitor-controls__sectionBody">
          {children}
        </div>
      ) : null}
    </section>
  );
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
  onOutlookTypeChange,
  stormReportsMeta,
  onStormReportsEnabledChange,
  onStormReportsFilterTornadoChange,
  onStormReportsFilterWindChange,
  onStormReportsFilterHailChange,
  onStormReportsMatchOutlookTypeChange,
  alertsMeta,
  onAlertsEnabledChange,
  onAlertsOpacityChange,
  onAlertsShowWatchesChange,
  onAlertsShowWarningsChange,
  onAlertsShowAdvisoriesChange,
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

      <MonitorControlsSection id="radar" title={<><Radar className="h-4 w-4" /> Radar</>}>
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
              onInput={(event) => onRadarSiteChange(event.currentTarget.value)}
              aria-label="Radar site"
              autoComplete="off"
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
      </MonitorControlsSection>

      <MonitorControlsSection id="satellite" title={<><Satellite className="h-4 w-4" /> Satellite</>}>
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
      </MonitorControlsSection>

      <MonitorControlsSection id="alerts" title={<><AlertTriangle className="h-4 w-4" /> Watches &amp; warnings</>}>
        <label className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings.alertsEnabled}
            onChange={(event) => onAlertsEnabledChange(event.target.checked)}
          />
          Show official NWS polygons
        </label>
        <label>
          Opacity
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.alertsOpacity}
            disabled={!settings.alertsEnabled}
            onChange={(event) => onAlertsOpacityChange(Number(event.target.value))}
          />
        </label>
        <label className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings.alertsShowWatches}
            disabled={!settings.alertsEnabled}
            onChange={(event) => onAlertsShowWatchesChange(event.target.checked)}
          />
          Watches
        </label>
        <label className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings.alertsShowWarnings}
            disabled={!settings.alertsEnabled}
            onChange={(event) => onAlertsShowWarningsChange(event.target.checked)}
          />
          Warnings
        </label>
        <label className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings.alertsShowAdvisories}
            disabled={!settings.alertsEnabled}
            onChange={(event) => onAlertsShowAdvisoriesChange(event.target.checked)}
          />
          Advisories
        </label>
        <div className="monitor-controls__meta">
          {alertsMeta.loading && 'Loading NWS alerts…'}
          {!alertsMeta.loading && alertsMeta.error}
          {!alertsMeta.loading && !alertsMeta.error && settings.alertsEnabled && (
            `${alertsMeta.polygonCount} polygon${alertsMeta.polygonCount === 1 ? '' : 's'}`
            + (alertsMeta.frameCount > 1 ? ` · frame ${alertsMeta.frameIndex + 1}/${alertsMeta.frameCount}` : '')
          )}
        </div>
      </MonitorControlsSection>

      <MonitorControlsSection id="storm-reports" title={<><MapPin className="h-4 w-4" /> SPC storm reports</>}>
        <label className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings.stormReportsEnabled}
            onChange={(event) => onStormReportsEnabledChange(event.target.checked)}
          />
          Show today&apos;s SPC reports
        </label>
        <label className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings.stormReportsFilterTornado}
            disabled={!settings.stormReportsEnabled}
            onChange={(event) => onStormReportsFilterTornadoChange(event.target.checked)}
          />
          Tornado
        </label>
        <label className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings.stormReportsFilterWind}
            disabled={!settings.stormReportsEnabled}
            onChange={(event) => onStormReportsFilterWindChange(event.target.checked)}
          />
          Wind
        </label>
        <label className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings.stormReportsFilterHail}
            disabled={!settings.stormReportsEnabled}
            onChange={(event) => onStormReportsFilterHailChange(event.target.checked)}
          />
          Hail
        </label>
        <label className="monitor-controls__checkbox">
          <input
            type="checkbox"
            checked={settings.stormReportsMatchOutlookType}
            disabled={!settings.stormReportsEnabled}
            onChange={(event) => onStormReportsMatchOutlookTypeChange(event.target.checked)}
          />
          Match selected outlook type
        </label>
        <div className="monitor-controls__meta">
          {stormReportsMeta.loading && 'Loading SPC today.csv…'}
          {!stormReportsMeta.loading && stormReportsMeta.error}
          {!stormReportsMeta.loading && !stormReportsMeta.error && settings.stormReportsEnabled && (
            `${stormReportsMeta.reports.length} shown`
            + (stormReportsMeta.totalCount !== stormReportsMeta.reports.length
              ? ` (${stormReportsMeta.totalCount} total today)`
              : ' today')
          )}
        </div>
      </MonitorControlsSection>

      <MonitorControlsSection id="outlooks" title={<><Shapes className="h-4 w-4" /> Outlooks</>}>
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
        <label>
          Outlook type
          <select
            aria-label="Outlook type"
            value={settings.outlookType}
            onChange={(event) => onOutlookTypeChange(event.target.value as MonitorOutlookLayerType)}
          >
            {MONITOR_OUTLOOK_LAYER_TYPES.map((type) => (
              <option key={type} value={type}>
                {MONITOR_OUTLOOK_LAYER_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <div className="monitor-controls__meta">{selectedOutlook.status || `Cycle ${selectedOutlook.cycleDate}`}</div>
      </MonitorControlsSection>

      <MonitorControlsSection id="playback" title={<><CloudSun className="h-4 w-4" /> Playback</>} defaultCollapsed>
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
          min="150"
          max="2000"
          step="100"
          value={settings.animationSpeedMs}
          onChange={(event) => onAnimationSpeedChange(Number(event.target.value))}
        />
        </label>
      </MonitorControlsSection>
    </aside>
  );
};

export default MonitorControls;
