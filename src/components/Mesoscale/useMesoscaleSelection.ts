/**
 * Mesoscale selection state: the chosen model, forecast hour, and active layers
 * live in the Mesoscale product slice so they persist with the product. This hook
 * reads them with sensible defaults and exposes small, intention-named setters.
 */
import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { MesoscaleModelId } from '../../mesoscale';
import { selectMesoscaleState, setMesoscaleModelContext, type MesoscaleModelContext } from '../../store/mesoscaleSlice';
import type { RootState } from '../../store';
import { DEFAULT_LAYER_ID, DEFAULT_LAYER_OPACITY } from './layerGroups';

const MODEL_IDS: readonly MesoscaleModelId[] = ['hrrr', 'rap', 'rrfs'];

const isModelId = (value: string | null): value is MesoscaleModelId =>
  value !== null && (MODEL_IDS as readonly string[]).includes(value);

export interface MesoscaleSelection {
  modelId: MesoscaleModelId;
  forecastHour: number;
  activeLayers: MesoscaleModelContext['activeLayers'];
  selectModel: (modelId: MesoscaleModelId) => void;
  selectHour: (forecastHour: number) => void;
  setLayers: (layers: MesoscaleModelContext['activeLayers']) => void;
}

/** Reads and updates the persisted model context. */
export const useMesoscaleSelection = (): MesoscaleSelection => {
  const dispatch = useDispatch();
  const context = useSelector((state: RootState) => selectMesoscaleState(state).modelContext);
  const modelId = isModelId(context.modelId) ? context.modelId : 'hrrr';
  const activeLayers = useMemo(
    () => (context.activeLayers.length > 0 ? context.activeLayers : [{ id: DEFAULT_LAYER_ID, opacity: DEFAULT_LAYER_OPACITY }]),
    [context.activeLayers],
  );
  const update = useCallback((next: Partial<MesoscaleModelContext>) => {
    dispatch(setMesoscaleModelContext({ ...context, modelId, activeLayers, ...next }));
  }, [activeLayers, context, dispatch, modelId]);

  return {
    modelId,
    forecastHour: context.forecastHour ?? 0,
    activeLayers,
    selectModel: (next) => update({ modelId: next, forecastHour: 0, cycle: null }),
    selectHour: (forecastHour) => update({ forecastHour }),
    setLayers: (layers) => update({ activeLayers: layers }),
  };
};
