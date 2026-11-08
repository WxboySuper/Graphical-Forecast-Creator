/**
 * Workspace surface state: the `surface` URL parameter decides whether a forecast
 * workspace shows its map, discussion, or review. The URL is the only source of
 * truth, so links, refreshes, and other components that edit the query string
 * (such as the embedded Discussion scope sync) can never disagree about it.
 */
import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

export type WorkspaceSurface = 'map' | 'discussion' | 'review';

export const OPEN_DISCUSSION_EVENT = 'gfc-open-severe-discussion';

const NON_MAP_SURFACES: ReadonlySet<string> = new Set(['discussion', 'review']);

/** Reads a surface from a URL value, treating anything unknown as the map. */
export const parseWorkspaceSurface = (value: string | null): WorkspaceSurface =>
  NON_MAP_SURFACES.has(value ?? '') ? (value as WorkspaceSurface) : 'map';

export const ALL_WORKSPACE_SURFACES: readonly WorkspaceSurface[] = ['map', 'discussion', 'review'];

/**
 * Returns the active surface and a setter that updates the URL. A surface the
 * workspace does not offer falls back to the map and is removed from the URL, so
 * the address never claims a surface the page is not showing.
 */
export const useWorkspaceSurface = (
  allowed: readonly WorkspaceSurface[] = ALL_WORKSPACE_SURFACES,
): {
  surface: WorkspaceSurface;
  selectSurface: (next: WorkspaceSurface) => void;
} => {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = parseWorkspaceSurface(new URLSearchParams(location.search).get('surface'));
  const surface = allowed.includes(requested) ? requested : 'map';

  const selectSurface = useCallback((next: WorkspaceSurface) => {
    const params = new URLSearchParams(location.search);
    if (next === 'map') params.delete('surface');
    else params.set('surface', next);
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (surface !== requested) selectSurface('map');
  }, [requested, selectSurface, surface]);

  useEffect(() => {
    if (!allowed.includes('discussion')) return undefined;
    const openDiscussion = () => selectSurface('discussion');
    window.addEventListener(OPEN_DISCUSSION_EVENT, openDiscussion);
    return () => window.removeEventListener(OPEN_DISCUSSION_EVENT, openDiscussion);
  }, [allowed, selectSurface]);

  return { surface, selectSurface };
};
