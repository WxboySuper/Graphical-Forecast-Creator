import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  setActiveOutlookType,
  setActiveProbability,
  toggleSignificant,
} from '../../store/forecastSlice';
import {
  OutlookType,
  CategoricalRiskLevel,
  TornadoProbability,
  WindHailProbability,
} from '../../types/outlooks';
import { getAvailableProbabilities } from './outlookPanelUtils';

export function useOutlookPanelLogic() {
  const dispatch = useDispatch();
  const { drawingState, emergencyMode } = useSelector((s: RootState) => s.forecast);
  const featureFlags = useSelector((s: RootState) => s.featureFlags);
  const { activeOutlookType, activeProbability, isSignificant } = drawingState;

  const significantThreatsEnabled = featureFlags.significantThreatsEnabled;

  const getOutlookTypeEnabled = useCallback((type: OutlookType) => ({
    tornado: featureFlags.tornadoOutlookEnabled,
    wind: featureFlags.windOutlookEnabled,
    hail: featureFlags.hailOutlookEnabled,
    categorical: featureFlags.categoricalOutlookEnabled,
  }[type] ?? false), [featureFlags]);

  const handleOutlookTypeChange = useCallback(
    (type: OutlookType) => {
      if (!getOutlookTypeEnabled(type)) {
        console.warn(`The ${type} outlook is temporarily unavailable due to maintenance or an issue.`);
        return;
      }
      dispatch(setActiveOutlookType(type));
    },
    [dispatch, getOutlookTypeEnabled]
  );

  const handleProbabilityChange = useCallback(
    (probability: TornadoProbability | WindHailProbability | CategoricalRiskLevel) => {
      dispatch(setActiveProbability(probability));
    },
    [dispatch]
  );

  const handleToggleSignificant = useCallback(() => {
    if (!significantThreatsEnabled) {
      console.warn('Significant threats are temporarily unavailable due to an issue.');
      return;
    }
    dispatch(toggleSignificant());
  }, [dispatch, significantThreatsEnabled]);

  const probabilities = getAvailableProbabilities(activeOutlookType);

  const probabilityHandlers = useMemo(
    () => Object.fromEntries(
      probabilities.map((p) => [p, () => handleProbabilityChange(p as (TornadoProbability | WindHailProbability | CategoricalRiskLevel))])
    ),
    [probabilities, handleProbabilityChange]
  ) as Record<string, () => void>;

  const outlookTypeHandlers = useMemo(
    () => ({
      tornado: () => handleOutlookTypeChange('tornado'),
      wind: () => handleOutlookTypeChange('wind'),
      hail: () => handleOutlookTypeChange('hail'),
      categorical: () => handleOutlookTypeChange('categorical'),
    }),
    [handleOutlookTypeChange]
  );

  return {
    featureFlags,
    emergencyMode,
    activeOutlookType,
    activeProbability,
    isSignificant,
    significantThreatsEnabled,
    getOutlookTypeEnabled,
    handleOutlookTypeChange,
    outlookTypeHandlers,
    handleProbabilityChange,
    handleToggleSignificant,
    probabilities,
    probabilityHandlers,
  } as const;
}

export default useOutlookPanelLogic;
