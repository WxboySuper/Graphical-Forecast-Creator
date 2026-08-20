import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
import { trimCurrentDayOutlooksToLand } from '../store/forecastSlice';
import type { AddToastFn } from '../components/Layout';
import { ensureLandMask } from '../utils/outlookPolygonMasking/landMaskRuntime';
import type { LandMaskStrategy } from '../utils/outlookPolygonMasking/types';
import { trimOutlookGeometry } from '../utils/outlookPolygonMasking/trimOutlookGeometry';
import type { Polygon, MultiPolygon } from 'geojson';

interface UseTrimCurrentDayOutlooksOptions {
  addToast: AddToastFn;
}

/** Runs the on-demand trim action after preloading the cached land mask. */
export const useTrimCurrentDayOutlooks = ({ addToast }: UseTrimCurrentDayOutlooksOptions) => {
  const dispatch = useDispatch<AppDispatch>();
  const strategy = useSelector((state: RootState) => state.overlays.outlookTrimStrategy);
  const currentDay = useSelector((state: RootState) => state.forecast.forecastCycle.currentDay);
  const [isTrimming, setIsTrimming] = useState(false);

  const trimCurrentDayOutlooks = useCallback(async () => {
    setIsTrimming(true);
    try {
      const landMask = await ensureLandMask(strategy);
      if (!landMask) {
        addToast('Land mask could not be built for trimming.', 'error');
        return;
      }

      dispatch(trimCurrentDayOutlooksToLand({ strategy }));
      addToast(`Trimmed outlooks on day ${currentDay} (prototype).`, 'success');
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Failed to trim outlook polygons.',
        'error',
      );
    } finally {
      setIsTrimming(false);
    }
  }, [addToast, currentDay, dispatch, strategy]);

  return { trimCurrentDayOutlooks, isTrimming };
};

/** Applies auto-trim to one geometry when enabled and not in preview-only mode. */
export const trimGeometryForAutoDraw = async (
  geometry: Polygon | MultiPolygon,
  strategy: LandMaskStrategy,
  autoOnDraw: boolean,
  previewOnly: boolean,
): Promise<Polygon | MultiPolygon> => {
  if (!autoOnDraw || previewOnly) {
    return geometry;
  }

  const landMask = await ensureLandMask(strategy);
  if (!landMask) {
    return geometry;
  }

  const trimmed = trimOutlookGeometry(geometry, landMask, strategy);
  return trimmed.geometry ?? geometry;
};
