import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { addFeature, resetCategorical } from '../store/forecastSlice';
import { getHighestCategoricalRisk } from '../utils/outlookUtils';
import { TornadoProbability, WindHailProbability, CategoricalRiskLevel } from '../types/outlooks';
import { v4 as uuidv4 } from 'uuid';

/**
 * Hook that automatically generates categorical outlooks based on probabilistic outlooks.
 * Note: General Thunderstorm (TSTM) areas must be drawn manually in categorical mode.
 */
const useAutoCategorical = () => {
  const dispatch = useDispatch();
  const { outlooks } = useSelector((state: RootState) => state.forecast);

  // Process probabilistic outlooks to generate categorical outlooks
  useEffect(() => {
    // Get all the probabilistic data
    const tornadoFeatures = Array.from(outlooks.tornado.entries());
    const windFeatures = Array.from(outlooks.wind.entries());
    const hailFeatures = Array.from(outlooks.hail.entries());
    const categoricalFeatures = Array.from(outlooks.categorical.entries());

    // Skip if there are no probabilistic outlooks
    if (tornadoFeatures.length === 0 && windFeatures.length === 0 && hailFeatures.length === 0) {
      // Keep any manually drawn TSTM areas, only clear other categorical risks
      const newCategoricalFeatures = categoricalFeatures.filter(([risk]) => risk === 'TSTM');
      if (newCategoricalFeatures.length > 0) {
        const newCategoricalMap = new Map(newCategoricalFeatures);
        dispatch({ type: 'forecast/setOutlookMap', payload: { outlookType: 'categorical', map: newCategoricalMap } });
      } else {
        dispatch(resetCategorical());
      }
      return;
    }

    // Clear all categorical outlooks except TSTM before regenerating
    const tstmFeatures = outlooks.categorical.get('TSTM') || [];
    dispatch(resetCategorical());
    
    // Restore TSTM features if they exist
    if (tstmFeatures.length > 0) {
      dispatch(addFeature({ feature: tstmFeatures[0] }));
    }

    // Process features from each outlook type
    [
      { type: 'tornado', features: tornadoFeatures },
      { type: 'wind', features: windFeatures },
      { type: 'hail', features: hailFeatures }
    ].forEach(({ type, features }) => {
      features.forEach(([probability, featureList]) => {
        featureList.forEach(feature => {
          // Get the categorical risk level based on the outlook type
          let categoricalRisk: CategoricalRiskLevel;
          switch (type) {
            case 'tornado':
              categoricalRisk = getHighestCategoricalRisk(
                probability as TornadoProbability,
                undefined,
                undefined
              );
              break;
            case 'wind':
              categoricalRisk = getHighestCategoricalRisk(
                undefined,
                probability as WindHailProbability,
                undefined
              );
              break;
            case 'hail':
              categoricalRisk = getHighestCategoricalRisk(
                undefined,
                undefined,
                probability as WindHailProbability
              );
              break;
            default:
              return;
          }

          // Skip if the conversion resulted in TSTM (this shouldn't happen normally)
          if (categoricalRisk === 'TSTM') {
            return;
          }

          const categoricalFeature = {
            ...feature,
            id: uuidv4(),
            properties: {
              ...feature.properties,
              outlookType: 'categorical',
              probability: categoricalRisk,
              derivedFrom: type,
              originalProbability: probability
            }
          };

          dispatch(addFeature({ feature: categoricalFeature }));
        });
      });
    });

  }, [outlooks.tornado, outlooks.wind, outlooks.hail, dispatch]);

  return null;
};

export default useAutoCategorical;