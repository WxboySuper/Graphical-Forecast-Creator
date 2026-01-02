import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { addFeature, resetCategorical, setOutlookMap } from '../store/forecastSlice';
import { getHighestCategoricalRisk } from '../utils/outlookUtils';
import { TornadoProbability, WindHailProbability, CategoricalRiskLevel, OutlookData } from '../types/outlooks';
import { v4 as uuidv4 } from 'uuid';

/**
 * Hook that automatically generates categorical outlooks based on probabilistic outlooks.
 * Note: General Thunderstorm (TSTM) areas must be drawn manually in categorical mode.
 */
const useAutoCategorical = () => {
  const dispatch = useDispatch();
  const { outlooks, drawingState } = useSelector((state: RootState) => state.forecast);
  const processingRef = useRef(false);
  const lastProcessedRef = useRef<string>('');

  // Process probabilistic outlooks to generate categorical outlooks
  useEffect(() => {
    // Don't auto-generate if user is actively drawing categorical features
    if (drawingState.activeOutlookType === 'categorical') {
      return;
    }

    // Prevent recursive updates
    if (processingRef.current) {
      return;
    }

    // Create a hash of the current probabilistic outlooks to detect changes
    const tornadoIds = Array.from(outlooks.tornado.values()).flat().map(f => f.id).sort().join(',');
    const windIds = Array.from(outlooks.wind.values()).flat().map(f => f.id).sort().join(',');
    const hailIds = Array.from(outlooks.hail.values()).flat().map(f => f.id).sort().join(',');
    const currentHash = `${tornadoIds}|${windIds}|${hailIds}`;

    // Skip if nothing has changed since last processing
    if (currentHash === lastProcessedRef.current) {
      return;
    }
    // Skip if there are no changes to process
    const hasChanges = ['tornado', 'wind', 'hail'].some(type => 
      outlooks[type as keyof typeof outlooks].size > 0
    );
    
    if (!hasChanges) {
      return;
    }

    processingRef.current = true;
    lastProcessedRef.current = currentHash;

    try {
      // Store existing TSTM areas before clearing categoricals
      const tstmFeatures = outlooks.categorical.get('TSTM') || [];
      const tstmMap = new Map([['TSTM', tstmFeatures]]);

      // Clear categorical outlooks except TSTM
      dispatch(resetCategorical());

      // Restore TSTM features if they exist
      if (tstmFeatures.length > 0) {
        dispatch(setOutlookMap({ outlookType: 'categorical', map: tstmMap }));
      }

      // Delegate processing to helper
      const highestRiskFeatures = processOutlooksToCategorical(outlooks);

      // Add all generated categorical features (if any)
      highestRiskFeatures.forEach(({ feature }) => {
        dispatch(addFeature({ feature }));
      });
    } finally {
      processingRef.current = false;
    }
  }, [dispatch, outlooks, drawingState.activeOutlookType]); // Add drawingState dependency

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

// Extract processing of probabilistic outlooks into a helper to reduce cyclomatic complexity
export function processOutlooksToCategorical(outlooks: OutlookData) {
  const highestRiskFeatures = new Map<string, {
    risk: CategoricalRiskLevel;
    feature: GeoJSON.Feature;
    sources: { type: string; probability: string }[];
  }>();

  const tornadoFeatures = Array.from(outlooks.tornado.entries());
  const windFeatures = Array.from(outlooks.wind.entries());
  const hailFeatures = Array.from(outlooks.hail.entries());

  const buckets = [
    { type: 'tornado', features: tornadoFeatures },
    { type: 'wind', features: windFeatures },
    { type: 'hail', features: hailFeatures }
  ];

  buckets.forEach(({ type, features }) => {
    features.forEach(([probability, featureList]: [string, GeoJSON.Feature[]]) => {
      featureList.forEach((feature: GeoJSON.Feature) => {
        // Get the categorical risk level based on the outlook type
        const risk = getHighestCategoricalRisk(
          type === 'tornado' ? (probability as TornadoProbability) : undefined,
          type === 'wind' ? (probability as WindHailProbability) : undefined,
          type === 'hail' ? (probability as WindHailProbability) : undefined
        );

        // Skip TSTM risk level (should be drawn manually)
        if (risk === 'TSTM') return;

        const featureId = String(feature.id ?? uuidv4());
        const existingFeature = highestRiskFeatures.get(featureId);

        if (!existingFeature || shouldReplaceRisk(existingFeature.risk, risk)) {
          highestRiskFeatures.set(featureId, {
            risk,
            feature: {
              ...feature,
              id: featureId,
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
          existingFeature.sources.push({ type, probability });
        }
      });
    });
  });

  return highestRiskFeatures;
};

export default useAutoCategorical;