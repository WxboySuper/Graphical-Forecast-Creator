import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store';
import { applyMonitorSettings } from '../store/monitorSlice';
import { useAuth } from '../auth/AuthProvider';
import { readStoredMonitorSettings, writeStoredMonitorSettings } from '../monitor/storage';
import type { MonitorSettings } from '../monitor/types';

export const useLocalMonitorSettings = (settings: MonitorSettings) => {
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
