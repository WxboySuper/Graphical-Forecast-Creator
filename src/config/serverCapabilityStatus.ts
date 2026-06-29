import { useCallback, useEffect, useState } from 'react';
import { getFeatureExposure, type FeatureKey } from './featureExposure';

export const CAPABILITY_STATUS_ENDPOINT = '/api/capabilities/status';

export type CapabilityAvailabilityReason =
  | 'available'
  | 'registry_disabled'
  | 'deployment_disabled'
  | 'emergency_disabled'
  | 'unknown';

export type CapabilityStatusEntry = {
  available: boolean;
  reason: CapabilityAvailabilityReason;
};

export type ServerCapabilityStatusResponse = {
  capabilities: Record<string, CapabilityStatusEntry>;
};

type CapabilityStatusSnapshot = {
  loaded: boolean;
  capabilities: Record<string, CapabilityStatusEntry>;
};

const EMPTY_STATUS: CapabilityStatusSnapshot = {
  loaded: false,
  capabilities: {},
};

const unavailableCapabilityKeys = new Set<string>();
const statusListeners = new Set<() => void>();

/** Notifies runtime hooks when a capability becomes unavailable after page load. */
const notifyCapabilityStatusListeners = (): void => {
  statusListeners.forEach((listener) => listener());
};

/** Marks a server capability unavailable after a disabled API response. */
export const markServerCapabilityUnavailable = (capabilityKey: string): void => {
  if (unavailableCapabilityKeys.has(capabilityKey)) {
    return;
  }

  unavailableCapabilityKeys.add(capabilityKey);
  notifyCapabilityStatusListeners();
};

/** Resets local unavailable markers. Intended for tests. */
export const resetServerCapabilityStatusState = (): void => {
  unavailableCapabilityKeys.clear();
  notifyCapabilityStatusListeners();
};

/** Returns the server capability key for a registry feature when server-backed. */
export const getServerCapabilityKeyForFeature = (feature: FeatureKey): string | null => {
  const definition = getFeatureExposure(feature);
  if (!definition.serverBacked) {
    return null;
  }

  return definition.serverCapabilityKey;
};

/** Reads the public server capability status document. */
export const fetchServerCapabilityStatus = async (): Promise<ServerCapabilityStatusResponse> => {
  const response = await fetch(CAPABILITY_STATUS_ENDPOINT);
  if (!response.ok) {
    throw new Error('Unable to fetch server capability status.');
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || typeof payload.capabilities !== 'object') {
    throw new Error('Server capability status response was malformed.');
  }

  return payload as ServerCapabilityStatusResponse;
};

/** Returns whether a capability is currently treated as unavailable on the client. */
export const isServerCapabilityAvailable = (
  capabilityKey: string,
  status: CapabilityStatusSnapshot = EMPTY_STATUS
): boolean => {
  if (unavailableCapabilityKeys.has(capabilityKey)) {
    return false;
  }

  if (!status.loaded) {
    return false;
  }

  const entry = status.capabilities[capabilityKey];
  return entry?.available === true;
};

/** Loads server capability status once and keeps local unavailable markers in sync. */
export const useServerCapabilityStatus = (): CapabilityStatusSnapshot => {
  const [status, setStatus] = useState<CapabilityStatusSnapshot>(EMPTY_STATUS);

  const reload = useCallback(() => {
    setStatus((current) => ({ ...current }));
  }, []);

  useEffect(() => {
    statusListeners.add(reload);
    return () => {
      statusListeners.delete(reload);
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;

    fetchServerCapabilityStatus()
      .then((response) => {
        if (cancelled) {
          return;
        }

        setStatus({
          loaded: true,
          capabilities: response.capabilities,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setStatus({
          loaded: true,
          capabilities: {},
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
};

/** Returns whether a server-backed feature is available at runtime on this deployment. */
export const useServerCapabilityAvailable = (feature: FeatureKey): boolean => {
  const capabilityKey = getServerCapabilityKeyForFeature(feature);
  const status = useServerCapabilityStatus();

  if (!capabilityKey) {
    return true;
  }

  return isServerCapabilityAvailable(capabilityKey, status);
};

/** Returns whether a server-backed feature should allow server API calls. */
export const useServerCapabilityApiEnabled = (feature: FeatureKey): boolean =>
  useServerCapabilityAvailable(feature);
