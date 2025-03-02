import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { addFeature } from '../store/forecastSlice';
import { getHighestCategoricalRisk } from '../utils/outlookUtils';
import { CategoricalRiskLevel, TornadoProbability, WindHailProbability } from '../types/outlooks';
import { v4 as uuidv4 } from 'uuid';

/**
 * Hook that automatically generates categorical outlooks based on probabilistic outlooks
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

    // Skip if there are no probabilistic outlooks
    if (tornadoFeatures.length === 0 && windFeatures.length === 0 && hailFeatures.length === 0) {
      return;
    }

    // TODO: Implement the actual conversion from probabilistic to categorical
    // This would involve GeoJSON operations to:
    // 1. Find overlaps between probabilistic areas
    // 2. Determine the highest risk level for each overlapping area
    // 3. Create new GeoJSON features for the categorical outlook

    // For now, this is a placeholder that simply copies each probabilistic area
    // and assigns it the appropriate categorical risk level

    // Process tornado features
    tornadoFeatures.forEach(([probability, features]) => {
      features.forEach(feature => {
        const categoricalRisk = getHighestCategoricalRisk(
          probability as TornadoProbability,
          undefined,
          undefined
        );

        const categoricalFeature = {
          ...feature,
          id: uuidv4(), // New ID for the categorical feature
          properties: {
            ...feature.properties,
            outlookType: 'categorical',
            probability: categoricalRisk,
            derivedFrom: 'tornado',
            originalProbability: probability
          }
        };

        dispatch(addFeature({ feature: categoricalFeature }));
      });
    });

    // Process wind features
    windFeatures.forEach(([probability, features]) => {
      features.forEach(feature => {
        const categoricalRisk = getHighestCategoricalRisk(
          undefined,
          probability as WindHailProbability,
          undefined
        );

        const categoricalFeature = {
          ...feature,
          id: uuidv4(), // New ID for the categorical feature
          properties: {
            ...feature.properties,
            outlookType: 'categorical',
            probability: categoricalRisk,
            derivedFrom: 'wind',
            originalProbability: probability
          }
        };

        dispatch(addFeature({ feature: categoricalFeature }));
      });
    });

    // Process hail features
    hailFeatures.forEach(([probability, features]) => {
      features.forEach(feature => {
        const categoricalRisk = getHighestCategoricalRisk(
          undefined,
          undefined,
          probability as WindHailProbability
        );

        const categoricalFeature = {
          ...feature,
          id: uuidv4(), // New ID for the categorical feature
          properties: {
            ...feature.properties,
            outlookType: 'categorical',
            probability: categoricalRisk,
            derivedFrom: 'hail',
            originalProbability: probability
          }
        };

        dispatch(addFeature({ feature: categoricalFeature }));
      });
    });
  }, [outlooks.tornado, outlooks.wind, outlooks.hail, dispatch]);

  return null;
};

export default useAutoCategorical;