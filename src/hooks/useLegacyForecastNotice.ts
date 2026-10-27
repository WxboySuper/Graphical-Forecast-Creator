import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router';

const SESSION_KEY = 'gfc:legacy-forecast-notice';

const readPersistedNotice = (): boolean => {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === 'true';
  } catch {
    return false;
  }
};

const persistNotice = (): void => {
  try {
    window.sessionStorage.setItem(SESSION_KEY, 'true');
  } catch {
    // Router state still displays the notice when session storage is unavailable.
  }
};

const clearPersistedNotice = (): void => {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Dismissing the notice must still work when session storage is unavailable.
  }
};

const usePersistedNotice = (hasRedirectMarker: boolean): [boolean, () => void] => {
  const [isPersisted, setIsPersisted] = useState(readPersistedNotice);

  useEffect(() => {
    if (!hasRedirectMarker) return;
    persistNotice();
    setIsPersisted(true);
  }, [hasRedirectMarker]);

  const clearNotice = useCallback(() => {
    clearPersistedNotice();
    setIsPersisted(false);
  }, []);

  return [isPersisted, clearNotice];
};

const getLocationState = (state: unknown): Record<string, unknown> => (
  state && typeof state === 'object' && !Array.isArray(state)
    ? state as Record<string, unknown>
    : {}
);

export const useLegacyForecastNotice = (
  workspaceRef: RefObject<HTMLDivElement | null>,
): [boolean, () => void] => {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = useMemo(() => getLocationState(location.state), [location.state]);
  const hasRedirectMarker = Boolean(locationState.legacyForecastRedirect);
  const [isPersisted, clearNotice] = usePersistedNotice(hasRedirectMarker);
  const shouldShowNotice = hasRedirectMarker || isPersisted;
  const shouldFocusWorkspace = useRef(false);

  useEffect(() => {
    if (shouldShowNotice || !shouldFocusWorkspace.current) return;
    shouldFocusWorkspace.current = false;
    workspaceRef.current?.focus();
  }, [shouldShowNotice, workspaceRef]);

  const dismissNotice = useCallback(() => {
    clearNotice();
    shouldFocusWorkspace.current = true;
    const nextState = { ...locationState };
    delete nextState.legacyForecastRedirect;
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: Object.keys(nextState).length > 0 ? nextState : null },
    );
  }, [clearNotice, location.hash, location.pathname, location.search, locationState, navigate]);

  return [shouldShowNotice, dismissNotice];
};
