/**
 * Severe discussion layout preferences: whether Discussion opens full width or
 * beside the map, how wide the side panel is, and whether the viewport is too
 * narrow for a side panel. Preferences persist locally; a `discussionLayout`
 * URL parameter overrides the saved layout without changing it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useLocation } from 'react-router';

export type DiscussionLayout = 'tabs' | 'panel';

export const PANEL_MIN_WIDTH = 360;
export const PANEL_MAX_WIDTH = 800;
export const PANEL_DEFAULT_WIDTH = 560;
const PANEL_KEYBOARD_STEP = 24;
const LAYOUT_STORAGE_KEY = 'gfc-severe-discussion-layout';
const WIDTH_STORAGE_KEY = 'gfc-severe-discussion-panel-width';
const COMPACT_QUERY = '(max-width: 900px)';

const clampWidth = (width: number): number => Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, width));

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The preference is optional when storage is unavailable.
  }
};

const readSavedWidth = (): number => {
  const saved = Number(readStorage(WIDTH_STORAGE_KEY));
  return Number.isFinite(saved) && saved >= PANEL_MIN_WIDTH && saved <= PANEL_MAX_WIDTH ? saved : PANEL_DEFAULT_WIDTH;
};

/** Tracks a media query, defaulting to false where matchMedia is unavailable. */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, [query]);
  return matches;
};

/** Resolves the saved layout choice, the URL override, and the compact-viewport fallback. */
export const useDiscussionLayoutChoice = () => {
  const { search } = useLocation();
  const [saved, setSaved] = useState<DiscussionLayout>(() => (readStorage(LAYOUT_STORAGE_KEY) === 'panel' ? 'panel' : 'tabs'));
  const forcedValue = new URLSearchParams(search).get('discussionLayout');
  const forced: DiscussionLayout | null = forcedValue === 'tabs' || forcedValue === 'panel' ? forcedValue : null;
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const preferred = forced ?? saved;
  const setLayout = useCallback((next: DiscussionLayout) => {
    setSaved(next);
    writeStorage(LAYOUT_STORAGE_KEY, next);
  }, []);
  return {
    preferred,
    effective: isCompact ? 'tabs' : preferred,
    isCompact,
    isForced: forced !== null,
    setLayout,
  } as const;
};

/** Pointer and keyboard resizing for the side panel, persisted between visits. */
export const useResizableDiscussionPanel = () => {
  const [width, setWidth] = useState(readSavedWidth);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef({ pointerX: 0, width });

  useEffect(() => {
    writeStorage(WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  useEffect(() => {
    if (!resizing) return undefined;
    const move = (event: PointerEvent) => {
      const next = clampWidth(dragRef.current.width + dragRef.current.pointerX - event.clientX);
      dragRef.current = { pointerX: event.clientX, width: next };
      setWidth(next);
    };
    const stop = () => setResizing(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [resizing]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    dragRef.current = { pointerX: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  }, [width]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.key === 'ArrowLeft' ? PANEL_KEYBOARD_STEP : -PANEL_KEYBOARD_STEP;
    setWidth((current) => clampWidth(current + delta));
  }, []);

  return { width, resizing, stopResize: () => setResizing(false), startResize, handleKeyDown } as const;
};
