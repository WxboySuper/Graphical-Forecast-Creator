import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { addFeature, resetCategorical, setOutlookMap, selectCurrentOutlooks, selectCurrentDay } from '../store/forecastSlice';
import { tornadoToCategorical, windToCategorical, hailToCategorical, totalSevereToCategorical } from '../utils/outlookUtils';
import { OutlookData, CIGLevel, CategoricalRiskLevel } from '../types/outlooks';
import { v4 as uuidv4 } from 'uuid';
import * as turf from '@turf/turf';
import { Feature, Polygon, MultiPolygon } from 'geojson';

/**
 * Hook that automatically generates categorical outlooks based on probabilistic outlooks.
 * Note: General Thunderstorm (TSTM) areas must be drawn manually in categorical mode.
 * 
 * Day 1/2: Converts tornado, wind, hail probabilities to categorical
 * Day 3: Converts totalSevere probabilities to categorical
 * Day 4-8: Does nothing (no categorical conversion)
 */
const useAutoCategorical = () => {
  const dispatch = useDispatch();
  const outlooks = useSelector(selectCurrentOutlooks);
  const currentDay = useSelector(selectCurrentDay);
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const processingRef = useRef(false);
  const lastProcessedRef = useRef<string>('');

  // Process probabilistic outlooks to generate categorical outlooks
  useEffect(() => {
    // Day 4-8 don't have categorical conversion
    if (currentDay >= 4) {
      return;
    }
    
    // Don't auto-generate if user is actively drawing categorical features
    if (drawingState.activeOutlookType === 'categorical') {
      return;
    }

    // Prevent recursive updates
    if (processingRef.current) {
      return;
    }

    // Create a hash of the current probabilistic outlooks to detect changes
    let currentHash = '';
    
    if (currentDay === 1 || currentDay === 2) {
      // Day 1/2: Hash tornado, wind, hail
      const tornadoIds = outlooks.tornado ? Array.from(outlooks.tornado.values()).flat().map(f => f.id).sort().join(',') : '';
      const windIds = outlooks.wind ? Array.from(outlooks.wind.values()).flat().map(f => f.id).sort().join(',') : '';
      const hailIds = outlooks.hail ? Array.from(outlooks.hail.values()).flat().map(f => f.id).sort().join(',') : '';
      currentHash = `${tornadoIds}|${windIds}|${hailIds}`;
    } else if (currentDay === 3) {
      // Day 3: Hash totalSevere
      const totalSevereIds = outlooks.totalSevere ? Array.from(outlooks.totalSevere.values()).flat().map(f => f.id).sort().join(',') : '';
      currentHash = totalSevereIds;
    }

    // Skip if nothing has changed since last processing
    if (currentHash === lastProcessedRef.current) {
      return;
    }
    
    // Skip if there are no changes to process
    let hasChanges = false;
    if (currentDay === 1 || currentDay === 2) {
      hasChanges = ['tornado', 'wind', 'hail'].some(type => {
        const map = outlooks[type as keyof typeof outlooks];
        return map && (map as Map<string, any>).size > 0;
      });
    } else if (currentDay === 3) {
      hasChanges = outlooks.totalSevere ? outlooks.totalSevere.size > 0 : false;
    }
    
    if (!hasChanges) {
      return;
    }

    processingRef.current = true;
    lastProcessedRef.current = currentHash;

    try {
      // Store existing TSTM areas before clearing categoricals
      const tstmFeatures = outlooks.categorical ? (outlooks.categorical.get('TSTM') || []) : [];
      const tstmMap = new Map([['TSTM', tstmFeatures]]);

      // Clear categorical outlooks except TSTM
      dispatch(resetCategorical());

      // Restore TSTM features if they exist
      if (tstmFeatures.length > 0) {
        dispatch(setOutlookMap({ outlookType: 'categorical', map: tstmMap }));
      }

      // Delegate processing to helper
      let generatedFeatures: GeoJSON.Feature[] = [];
      if (currentDay === 1 || currentDay === 2) {
        generatedFeatures = processDay12OutlooksToCategorical(outlooks);
      } else if (currentDay === 3) {
        generatedFeatures = processDay3OutlooksToCategorical(outlooks);
      }

      // Add all generated categorical features
      generatedFeatures.forEach((feature) => {
        dispatch(addFeature({ feature }));
      });
    } finally {
      processingRef.current = false;
    }
  }, [dispatch, outlooks, drawingState.activeOutlookType, currentDay]);

  return null;
};

/**
 * Entry point for tests and manual processing.
 * Converts probabilistic outlooks to categorical features.
 */
export function processOutlooksToCategorical(outlooks: OutlookData, day: number = 1): GeoJSON.Feature[] {
  if (day === 1 || day === 2) {
    return processDay12OutlooksToCategorical(outlooks);
  } else if (day === 3) {
    return processDay3OutlooksToCategorical(outlooks);
  }
  return [];
}

// Helper to safely union a list of polygons
const safeUnion = (features: Feature<Polygon | MultiPolygon>[]): Feature<Polygon | MultiPolygon> | null => {
  if (features.length === 0) return null;
  if (features.length === 1) return features[0];
  
  try {
    // Turf v7: union takes a FeatureCollection
    const fc = turf.featureCollection(features);
    const result = turf.union(fc);
    return result as Feature<Polygon | MultiPolygon>;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error in union operation', e);
    return features[0]; // Fallback
  }
};

// Helper to convert Day 1/2 probability features to categorical pieces
export function processDay12OutlooksToCategorical(outlooks: OutlookData): GeoJSON.Feature[] {
  const generatedFeatures: GeoJSON.Feature[] = [];
  const riskPolygons = new Map<CategoricalRiskLevel, Feature<Polygon | MultiPolygon>[]>();

  // 2. Process each Probability Type
  const types = ['tornado', 'wind', 'hail'] as const;
  
  types.forEach(type => {
    const probMap = outlooks[type];
    if (!probMap) return; // Skip if outlook map doesn't exist for this day
    
    // Split into Probability Polygons and Hatching Polygons
    const probabilityFeatures = new Map<string, Feature<Polygon | MultiPolygon>[]>();
    const hatchingFeatures = new Map<CIGLevel, Feature<Polygon | MultiPolygon>[]>();
    
    probMap.forEach((features, key) => {
      // Cast to Polygon/MultiPolygon
      const validFeatures = features.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') as Feature<Polygon | MultiPolygon>[];
      if (validFeatures.length === 0) return;

      if (key.startsWith('CIG')) {
        hatchingFeatures.set(key as CIGLevel, validFeatures);
      } else {
        probabilityFeatures.set(key, validFeatures);
      }
    });

    // Create Unioned Hatching Regions for this type
    const hatchingRegions = new Map<CIGLevel, Feature<Polygon | MultiPolygon>>();
    const cigLevels: CIGLevel[] = ['CIG3', 'CIG2', 'CIG1'];
    
    cigLevels.forEach(cig => {
      const features = hatchingFeatures.get(cig);
      if (features) {
        const unioned = safeUnion(features);
        if (unioned) hatchingRegions.set(cig, unioned);
      }
    });

    // Process Probabilities against Hatching (of the same type)
    probabilityFeatures.forEach((features, probStr) => {
      features.forEach(poly => {
        let remainingPoly: Feature<Polygon | MultiPolygon> | null = poly;

        // Intersect with Hatching Layers
        cigLevels.forEach(cig => {
          if (!remainingPoly) return;
          const hatchRegion = hatchingRegions.get(cig);
          
          if (hatchRegion) {
            try {
              // Turf v7: intersect takes FeatureCollection
              const intersection = turf.intersect(turf.featureCollection([remainingPoly, hatchRegion]));
              if (intersection) {
                // We found a piece with this CIG level
                addPieceToRiskMap(type, probStr, cig, intersection as Feature<Polygon | MultiPolygon>, riskPolygons);
                
                // Subtract this piece from the remaining polygon
                // Turf v7: difference takes FeatureCollection
                remainingPoly = turf.difference(turf.featureCollection([remainingPoly, intersection as Feature<Polygon | MultiPolygon>])) as Feature<Polygon | MultiPolygon> | null;
              }
            } catch (e) {
                // Ignore topology errors
            }
          }
        });

        // Any remaining part is CIG0
        if (remainingPoly) {
             addPieceToRiskMap(type, probStr, 'CIG0', remainingPoly, riskPolygons);
        }
      });
    });
  });

  // 3. Union polygons of the same Risk Level and create final features
  riskPolygons.forEach((polys, risk) => {
    if (risk === 'TSTM') return; // Skip TSTM (Manual only)
    
    const unioned = safeUnion(polys);
    if (unioned) {
      generatedFeatures.push({
        ...unioned,
        id: uuidv4(),
        properties: {
          outlookType: 'categorical',
          probability: risk,
          derivedFrom: 'auto-generated'
        }
      });
    }
  });

  return generatedFeatures;
};

function addPieceToRiskMap(
  type: 'tornado' | 'wind' | 'hail', 
  prob: string, 
  cig: CIGLevel, 
  poly: Feature<Polygon | MultiPolygon>,
  riskMap: Map<CategoricalRiskLevel, Feature<Polygon | MultiPolygon>[]>
) {
    let risk: CategoricalRiskLevel = 'TSTM';
    if (type === 'tornado') risk = tornadoToCategorical(prob, cig);
    if (type === 'wind') risk = windToCategorical(prob, cig);
    if (type === 'hail') risk = hailToCategorical(prob, cig);

    if (risk !== 'TSTM') {
        const current = riskMap.get(risk) || [];
        current.push(poly);
        riskMap.set(risk, current);
    }
}

// Helper to convert Day 3 Total Severe probability features to categorical pieces
export function processDay3OutlooksToCategorical(outlooks: OutlookData): GeoJSON.Feature[] {
  const generatedFeatures: GeoJSON.Feature[] = [];
  const riskPolygons = new Map<CategoricalRiskLevel, Feature<Polygon | MultiPolygon>[]>();

  // Day 3 only has totalSevere
  const probMap = outlooks.totalSevere;
  if (!probMap) return generatedFeatures; // No totalSevere data
  
  // Split into Probability Polygons and Hatching Polygons
  const probabilityFeatures = new Map<string, Feature<Polygon | MultiPolygon>[]>();
  const hatchingFeatures = new Map<CIGLevel, Feature<Polygon | MultiPolygon>[]>();
  
  probMap.forEach((features, key) => {
    const validFeatures = features.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') as Feature<Polygon | MultiPolygon>[];
    if (validFeatures.length === 0) return;

    if (key.startsWith('CIG')) {
      hatchingFeatures.set(key as CIGLevel, validFeatures);
    } else {
      probabilityFeatures.set(key, validFeatures);
    }
  });

  // Create Unioned Hatching Regions
  const hatchingRegions = new Map<CIGLevel, Feature<Polygon | MultiPolygon>>();
  const cigLevels: CIGLevel[] = ['CIG2', 'CIG1']; // Day 3 only has CIG0, 1, 2 (no CIG3)
  
  cigLevels.forEach(cig => {
    const features = hatchingFeatures.get(cig);
    if (features) {
      const unioned = safeUnion(features);
      if (unioned) hatchingRegions.set(cig, unioned);
    }
  });

  // Process Probabilities against Hatching
  probabilityFeatures.forEach((features, probStr) => {
    features.forEach(poly => {
      let remainingPoly: Feature<Polygon | MultiPolygon> | null = poly;

      // Intersect with Hatching Layers
      cigLevels.forEach(cig => {
        if (!remainingPoly) return;
        const hatchRegion = hatchingRegions.get(cig);
        
        if (hatchRegion) {
          try {
            const intersection = turf.intersect(turf.featureCollection([remainingPoly, hatchRegion]));
            if (intersection) {
              // We found a piece with this CIG level
              const risk = totalSevereToCategorical(probStr, cig);
              if (risk !== 'TSTM') {
                const current = riskPolygons.get(risk) || [];
                current.push(intersection as Feature<Polygon | MultiPolygon>);
                riskPolygons.set(risk, current);
              }
              
              // Subtract this piece from the remaining polygon
              remainingPoly = turf.difference(turf.featureCollection([remainingPoly, intersection as Feature<Polygon | MultiPolygon>])) as Feature<Polygon | MultiPolygon> | null;
            }
          } catch (e) {
            // Ignore topology errors
          }
        }
      });

      // Any remaining part is CIG0
      if (remainingPoly) {
        const risk = totalSevereToCategorical(probStr, 'CIG0');
        if (risk !== 'TSTM') {
          const current = riskPolygons.get(risk) || [];
          current.push(remainingPoly);
          riskPolygons.set(risk, current);
        }
      }
    });
  });

  // Union polygons of the same Risk Level and create final features
  riskPolygons.forEach((polys, risk) => {
    if (risk === 'TSTM') return; // Skip TSTM (Manual only)
    
    const unioned = safeUnion(polys);
    if (unioned) {
      generatedFeatures.push({
        ...unioned,
        id: uuidv4(),
        properties: {
          outlookType: 'categorical',
          probability: risk,
          derivedFrom: 'auto-generated'
        }
      });
    }
  });

  return generatedFeatures;
}

export default useAutoCategorical;