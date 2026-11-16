/**
 * Hidden-map guards: a workspace keeps its map mounted but hidden while another
 * surface shows. These hooks keep that safe: focus leaves the hidden map, its
 * controls leave the tab order on browsers without `inert`, and the map is
 * re-measured when it shows again so it never returns blank.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { ForecastMapHandle } from '../Map/ForecastMap';
import { makeSubtreeUntabbable } from '../../pages/forecastWorkspaceFocus';

interface HiddenMapOptions {
  rootRef: RefObject<HTMLElement | null>;
  mapSelector: string;
  hidden: boolean;
}

/** Moves focus to a safe element when the map hides while holding focus. */
const useReturnFocusFromHiddenMap = ({ rootRef, mapSelector, hidden }: HiddenMapOptions, returnSelector: string) => {
  useEffect(() => {
    if (!hidden) return;
    const map = rootRef.current?.querySelector(mapSelector);
    if (!map?.contains(document.activeElement)) return;
    rootRef.current?.querySelector<HTMLElement>(returnSelector)?.focus();
  }, [hidden, mapSelector, returnSelector, rootRef]);
};

/** Removes the hidden map's controls from the tab order where `inert` is unsupported. */
const useUntabbableWhileHidden = ({ rootRef, mapSelector, hidden }: HiddenMapOptions) => {
  useEffect(() => {
    if (!hidden) return undefined;
    const map = rootRef.current?.querySelector<HTMLElement>(mapSelector);
    if (!map || 'inert' in map) return undefined;
    return makeSubtreeUntabbable(map);
  }, [hidden, mapSelector, rootRef]);
};

/** Re-measures the OpenLayers map after it shows again or its container changes size. */
export const useMapResizeOnShow = (
  mapRef: RefObject<ForecastMapHandle | null>,
  hidden: boolean,
  layoutKey: string,
) => {
  useEffect(() => {
    if (hidden) return undefined;
    let nested = 0;
    const frame = window.requestAnimationFrame(() => {
      nested = window.requestAnimationFrame(() => mapRef.current?.getMap()?.updateSize());
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (nested) window.cancelAnimationFrame(nested);
    };
  }, [hidden, layoutKey, mapRef]);
};

/** Applies every guard a hidden map needs. */
export const useHiddenMapGuards = (
  options: HiddenMapOptions & { mapRef: RefObject<ForecastMapHandle | null>; returnSelector: string; layoutKey: string },
) => {
  const { mapRef, returnSelector, layoutKey, ...hiddenOptions } = options;
  useReturnFocusFromHiddenMap(hiddenOptions, returnSelector);
  useUntabbableWhileHidden(hiddenOptions);
  useMapResizeOnShow(mapRef, hiddenOptions.hidden, layoutKey);
};
