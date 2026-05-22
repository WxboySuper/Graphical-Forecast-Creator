import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useOutletContext } from 'react-router-dom';
import type { RootState, AppDispatch } from '../store';
import {
  applyMonitorSettings,
  setAnimationEnabled,
  setAnimationSpeedMs,
  setMonitorOutlookSource,
  setMonitorOutlookType,
  setAlertsEnabled,
  setAlertsOpacity,
  setAlertsShowAdvisories,
  setAlertsShowWarnings,
  setAlertsShowWatches,
  setStormReportsEnabled,
  setStormReportsFilterHail,
  setStormReportsFilterTornado,
  setStormReportsFilterWind,
  setStormReportsMatchOutlookType,
  setRadarMode,
  setRadarOpacity,
  setRadarProduct,
  setRadarSite,
  setSatelliteOpacity,
  setSatelliteProduct,
} from '../store/monitorSlice';
import { selectForecastCycle, selectSavedCycles } from '../store/forecastSlice';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { useCloudCycles } from '../hooks/useCloudCycles';
import type { AddToastFn } from '../components/Layout';
import { MonitorControls, MonitorMap } from '../components/Monitor';
import { buildMonitorOutlookOptions, resolveSelectedOutlookOption } from '../monitor/outlookSources';
import type { MonitorOutlookSourceOption } from '../monitor/outlookSources';
import { readStoredMonitorSettings, writeStoredMonitorSettings } from '../monitor/storage';
import type { MonitorSettings } from '../monitor/types';
import { usePremiumMonitorSettingsSync } from './usePremiumMonitorSettingsSync';
import { buildRadarLayerConfig, buildSatelliteLayerConfig } from '../monitor/wms';
import { useLiveWmsLayers } from '../monitor/useLiveWmsLayers';
import { useMonitorNwsAlerts } from '../monitor/useMonitorNwsAlerts';
import { useMonitorStormReports } from '../monitor/useMonitorStormReports';
import { useRadarSiteOptions } from '../monitor/useRadarSiteOptions';
import { deserializeForecast } from '../utils/fileUtils';
import { getLocalCalendarDate } from '../utils/localDate';
import './MonitorPage.css';

interface PageContext {
  addToast: AddToastFn;
}

const useLocalMonitorSettings = (settings: MonitorSettings) => {
  const dispatch = useDispatch<AppDispatch>();
  const { syncedSettings } = useAuth();
  const hydratedRef = useRef(false);
  const persistReadyRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }

    hydratedRef.current = true;
    dispatch(applyMonitorSettings(syncedSettings?.monitorSettings ?? readStoredMonitorSettings()));
  }, [dispatch, syncedSettings?.monitorSettings]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }

    writeStoredMonitorSettings(settings);
  }, [settings]);
};

const useCloudOutlookData = ({
  selectedOption,
  today,
  addToast,
}: {
  selectedOption: MonitorOutlookSourceOption;
  today: string;
  addToast: AddToastFn;
}) => {
  const { loadCycle } = useCloudCycles();
  const [cloudOption, setCloudOption] = useState<MonitorOutlookSourceOption | null>(null);

  useEffect(() => {
    let active = true;

    if (selectedOption.kind !== 'cloud-cycle') {
      setCloudOption(null);
      return;
    }

    loadCycle(selectedOption.id)
      .then((payload) => {
        if (!active || !payload) {
          return;
        }

        const cycle = deserializeForecast(payload);
        const dayOne = cycle.cycleDate === today ? cycle.days[1]?.data : undefined;
        setCloudOption({
          ...selectedOption,
          data: dayOne,
          status: dayOne ? undefined : 'Cloud cycle does not contain a Day 1 outlook for today.',
        });
      })
      .catch(() => {
        if (active) {
          addToast('Cloud outlook could not be loaded.', 'error');
          setCloudOption({
            ...selectedOption,
            status: 'Cloud outlook could not be loaded.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [addToast, loadCycle, selectedOption, today]);

  return selectedOption.kind === 'cloud-cycle' ? cloudOption ?? selectedOption : selectedOption;
};

/** Real-time monitor page for radar, satellite, and read-only personal outlook overlays. */
export const MonitorPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { addToast } = useOutletContext<PageContext>();
  const settings = useSelector((state: RootState) => state.monitor);
  const currentCycle = useSelector(selectForecastCycle);
  const savedCycles = useSelector(selectSavedCycles);
  const { cycles: cloudCycles, loading: cloudCyclesLoading } = useCloudCycles();
  const { premiumActive } = useEntitlement();
  const { sites: radarSiteOptions, loading: radarSitesLoading, error: radarSitesError } = useRadarSiteOptions();
  const today = useMemo(() => getLocalCalendarDate(), []);

  useLocalMonitorSettings(settings);
  usePremiumMonitorSettingsSync(settings);

  const outlookOptions = useMemo(() => buildMonitorOutlookOptions({
    currentCycle,
    savedCycles,
    cloudCycles: premiumActive ? cloudCycles : [],
    today,
  }), [cloudCycles, currentCycle, premiumActive, savedCycles, today]);

  const selectedOption = useMemo(
    () => resolveSelectedOutlookOption(outlookOptions, settings.outlookSource),
    [outlookOptions, settings.outlookSource]
  );
  const selectedOutlook = useCloudOutlookData({ selectedOption, today, addToast });

  const radarConfig = useMemo(() => buildRadarLayerConfig(settings), [settings]);
  const satelliteConfig = useMemo(() => buildSatelliteLayerConfig(settings.satelliteProduct), [settings.satelliteProduct]);
  const [refreshToken, setRefreshToken] = useState(0);
  const { radarDisplayTime, satelliteDisplayTime } = useLiveWmsLayers({
    radarConfig,
    satelliteConfig,
    animationEnabled: settings.animationEnabled,
    animationSpeedMs: settings.animationSpeedMs,
    refreshToken,
    addToast,
  });

  const stormReportState = useMonitorStormReports({
    enabled: settings.stormReportsEnabled,
    filterTornado: settings.stormReportsFilterTornado,
    filterWind: settings.stormReportsFilterWind,
    filterHail: settings.stormReportsFilterHail,
    matchOutlookType: settings.stormReportsMatchOutlookType,
    outlookType: settings.outlookType,
    refreshToken,
    addToast,
  });

  const alertState = useMonitorNwsAlerts({
    enabled: settings.alertsEnabled,
    showWatches: settings.alertsShowWatches,
    showWarnings: settings.alertsShowWarnings,
    showAdvisories: settings.alertsShowAdvisories,
    animationEnabled: settings.animationEnabled,
    animationSpeedMs: settings.animationSpeedMs,
    refreshToken,
    addToast,
  });

  const handleRefreshLiveLayers = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  const radarLayer = useMemo(
    () => radarConfig ? { ...radarConfig, latestTime: radarDisplayTime } : null,
    [radarConfig, radarDisplayTime]
  );
  const satelliteLayer = useMemo(
    () => satelliteConfig ? { ...satelliteConfig, latestTime: satelliteDisplayTime } : null,
    [satelliteConfig, satelliteDisplayTime]
  );

  const handleOutlookSourceChange = useCallback((source: MonitorSettings['outlookSource']) => {
    dispatch(setMonitorOutlookSource(source));
  }, [dispatch]);

  const handleOutlookTypeChange = useCallback((type: MonitorSettings['outlookType']) => {
    dispatch(setMonitorOutlookType(type));
  }, [dispatch]);

  const syncLabel = premiumActive ? 'Cloud sync eligible' : 'Local settings';
  const statusMessage = cloudCyclesLoading
    ? 'Loading saved outlook sources.'
    : 'Live radar, satellite, SPC reports, and NWS alerts refresh with Playback or Refresh.';

  return (
    <div className="monitor-page">
      <MonitorControls
        settings={settings}
        outlookOptions={outlookOptions}
        selectedOutlook={selectedOutlook}
        radarSiteOptions={radarSiteOptions}
        radarSitesLoading={radarSitesLoading}
        radarSitesError={radarSitesError}
        radarLatestTime={radarDisplayTime}
        satelliteLatestTime={satelliteDisplayTime}
        statusMessage={statusMessage}
        syncLabel={syncLabel}
        onRadarModeChange={(mode) => dispatch(setRadarMode(mode))}
        onRadarProductChange={(product) => dispatch(setRadarProduct(product))}
        onRadarSiteChange={(site) => dispatch(setRadarSite(site))}
        onRadarOpacityChange={(opacity) => dispatch(setRadarOpacity(opacity))}
        onSatelliteProductChange={(product) => dispatch(setSatelliteProduct(product))}
        onSatelliteOpacityChange={(opacity) => dispatch(setSatelliteOpacity(opacity))}
        onOutlookSourceChange={handleOutlookSourceChange}
        onOutlookTypeChange={handleOutlookTypeChange}
        stormReportsMeta={stormReportState}
        onStormReportsEnabledChange={(enabled) => dispatch(setStormReportsEnabled(enabled))}
        onStormReportsFilterTornadoChange={(enabled) => dispatch(setStormReportsFilterTornado(enabled))}
        onStormReportsFilterWindChange={(enabled) => dispatch(setStormReportsFilterWind(enabled))}
        onStormReportsFilterHailChange={(enabled) => dispatch(setStormReportsFilterHail(enabled))}
        onStormReportsMatchOutlookTypeChange={(enabled) => dispatch(setStormReportsMatchOutlookType(enabled))}
        alertsMeta={alertState}
        onAlertsEnabledChange={(enabled) => dispatch(setAlertsEnabled(enabled))}
        onAlertsOpacityChange={(opacity) => dispatch(setAlertsOpacity(opacity))}
        onAlertsShowWatchesChange={(enabled) => dispatch(setAlertsShowWatches(enabled))}
        onAlertsShowWarningsChange={(enabled) => dispatch(setAlertsShowWarnings(enabled))}
        onAlertsShowAdvisoriesChange={(enabled) => dispatch(setAlertsShowAdvisories(enabled))}
        onAnimationEnabledChange={(enabled) => dispatch(setAnimationEnabled(enabled))}
        onAnimationSpeedChange={(speed) => dispatch(setAnimationSpeedMs(speed))}
        onRefresh={handleRefreshLiveLayers}
      />

      <MonitorMap
        mapView={settings.mapView}
        radarLayer={radarLayer}
        radarOpacity={settings.radarOpacity}
        satelliteLayer={satelliteLayer}
        satelliteOpacity={settings.satelliteOpacity}
        outlookData={selectedOutlook.data}
        outlookType={settings.outlookType}
        stormReports={stormReportState.reports}
        alertsCollection={alertState.alertCollection}
        alertsOpacity={settings.alertsOpacity}
      />
    </div>
  );
};

export default MonitorPage;
