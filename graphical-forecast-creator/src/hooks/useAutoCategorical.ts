import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { addFeature, resetCategorical, setOutlookMap } from '../store/forecastSlice';
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
    // Store existing TSTM areas before clearing categoricals
    const tstmFeatures = outlooks.categorical.get('TSTM') || [];
    const tstmMap = new Map([['TSTM', tstmFeatures]]);

    // Clear categorical outlooks except TSTM
    dispatch(resetCategorical());
    
    // Restore TSTM features if they exist
    if (tstmFeatures.length > 0) {
      dispatch(setOutlookMap({ 
        outlookType: 'categorical', 
        map: tstmMap 
      }));
    }

    // Get all the probabilistic data
    const tornadoFeatures = Array.from(outlooks.tornado.entries());
    const windFeatures = Array.from(outlooks.wind.entries());
    const hailFeatures = Array.from(outlooks.hail.entries());

    // Skip if there are no probabilistic outlooks
    if (tornadoFeatures.length === 0 && windFeatures.length === 0 && hailFeatures.length === 0) {
      return;
    }

    // Create a map to track the highest risk level for each area
    const highestRiskFeatures = new Map<string, {
      risk: CategoricalRiskLevel;
      feature: GeoJSON.Feature;
      sources: { type: string; probability: string }[];
    }>();

    // Process features from each outlook type
    [
      { type: 'tornado', features: tornadoFeatures },
      { type: 'wind', features: windFeatures },
      { type: 'hail', features: hailFeatures }
    ].forEach(({ type, features }) => {
      features.forEach(([probability, featureList]) => {
        featureList.forEach(feature => {
          // Skip existing TSTM areas
          if (type === 'categorical' && probability === 'TSTM') return;

          // Get the categorical risk level based on the outlook type
          const risk = getHighestCategoricalRisk(
            type === 'tornado' ? probability as TornadoProbability : undefined,
            type === 'wind' ? probability as WindHailProbability : undefined,
            type === 'hail' ? probability as WindHailProbability : undefined
          );

          // Skip TSTM risk level (should be drawn manually)
          if (risk === 'TSTM') return;

          const featureId = feature.id as string;
          const existingFeature = highestRiskFeatures.get(featureId);

          if (!existingFeature || shouldReplaceRisk(existingFeature.risk, risk)) {
            highestRiskFeatures.set(featureId, {
              risk,
              feature: {
                ...feature,
                properties: {
                  ...feature.properties,
                  outlookType: 'categorical',
                  probability: risk,
                  derivedFrom: type,
                  originalProbability: probability
                }
              },
              sources: [{ type, probability }]
            });
          } else if (existingFeature.risk === risk) {
            // Add this outlook as an additional source
            existingFeature.sources.push({ type, probability });
          }
        });
      });
    });

    // Add all generated categorical features
    highestRiskFeatures.forEach(({ feature }) => {
      dispatch(addFeature({ feature: {
        ...feature,
        id: uuidv4() // Generate new ID to avoid conflicts
      }}));
    });

  }, [outlooks.tornado, outlooks.wind, outlooks.hail, dispatch]);

  return null;
};

// Helper function to determine if a new risk level should replace the existing one
const shouldReplaceRisk = (existing: CategoricalRiskLevel, newRisk: CategoricalRiskLevel): boolean => {
  const riskOrder: Record<CategoricalRiskLevel, number> = {
    'TSTM': 0,
    'MRGL': 1,
    'SLGT': 2,
    'ENH': 3,
    'MDT': 4,
    'HIGH': 5
  };
  return riskOrder[newRisk] > riskOrder[existing];
};

export default useAutoCategorical;