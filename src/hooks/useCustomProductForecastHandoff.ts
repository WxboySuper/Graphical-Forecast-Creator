import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useEntitlement } from '../billing/EntitlementProvider';
import type { AddToastFn } from '../components/Layout';
import { isFeatureExposed } from '../config/featureExposure';
import type { ForecastWorkspaceId } from '../config/forecastWorkspaces';
import {
  consumeCustomProductForecastHandoff,
  restoreCustomProductForecastHandoff,
} from '../lib/customProductHandoff';
import type { RootState } from '../store';
import { addCustomLayer, setCustomEditorMode } from '../store/forecastSlice';
import { CUSTOM_PRODUCT_LIMITS } from '../types/customProducts';

const restoreWithError = (message: string, addToast: AddToastFn, layer: Parameters<typeof restoreCustomProductForecastHandoff>[0], workspaceId: ForecastWorkspaceId) => {
  restoreCustomProductForecastHandoff(layer, workspaceId);
  addToast(message, 'error');
};

/** Consumes a staged reusable product only after session restoration has established a valid destination. */
export const useCustomProductForecastHandoff = (ready: boolean, addToast: AddToastFn, workspaceId: ForecastWorkspaceId): void => {
  const dispatch = useDispatch();
  const { premiumActive } = useEntitlement();
  const destinationDay = useSelector((state: RootState) => {
    const cycle = state.forecast.forecastCycle;
    return cycle.days[cycle.currentDay];
  });

  useEffect(() => {
    if (!ready || !isFeatureExposed('customProducts')) return;
    // The handoff names its workspace. Consuming it from a different editor
    // would inject Custom layers into a workspace that does not own them.
    const stagedLayer = consumeCustomProductForecastHandoff(premiumActive, workspaceId);
    if (!stagedLayer) return;
    if (!destinationDay) {
      restoreWithError('Select a valid forecast day before loading this product.', addToast, stagedLayer, workspaceId);
      return;
    }
    if ((destinationDay.customLayers?.layers.length ?? 0) >= CUSTOM_PRODUCT_LIMITS.layersPerCollection) {
      restoreWithError(
        `Remove a custom layer before loading this product (maximum ${CUSTOM_PRODUCT_LIMITS.layersPerCollection}).`,
        addToast,
        stagedLayer,
        workspaceId,
      );
      return;
    }
    dispatch(addCustomLayer(stagedLayer));
    dispatch(setCustomEditorMode('custom'));
  }, [addToast, destinationDay, dispatch, premiumActive, ready, workspaceId]);
};
