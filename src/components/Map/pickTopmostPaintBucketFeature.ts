/**
 * Paint-bucket feature picker. Finds the highest-rendered eligible forecast feature
 * at a map pixel for subsequent editing.
 */
import type OLMap from 'ol/Map';
import { type default as OLFeature, type FeatureLike } from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type VectorLayer from 'ol/layer/Vector';
import { computeZIndex } from '../../utils/mapStyleUtils';
import type { EditableOutlookType } from './openLayersMapStyles';

/** Computes the display priority used to choose an overlapping feature. */
const getFeatureStackIndex = (feature: FeatureLike): number => {
  const outlookType = feature.get('outlookType') as string | undefined;
  const probability = feature.get('probability') as string | undefined;
  if (!outlookType || !probability) {
    return -1;
  }
  return computeZIndex(outlookType as EditableOutlookType, probability);
};

/** Picks the highest-risk polygon under a pixel so overlapping edits target the top layer. */
export const pickTopmostPaintBucketFeature = (
  map: OLMap,
  pixel: number[],
  vectorLayer: VectorLayer | null,
): OLFeature<Geometry> | undefined => {
  let topFeature: OLFeature<Geometry> | undefined;
  let topIndex = -1;

  map.forEachFeatureAtPixel(
    pixel,
    (candidate, layer) => {
      if (layer !== vectorLayer) {
        return false;
      }

      const stackIndex = getFeatureStackIndex(candidate);
      if (stackIndex > topIndex) {
        topIndex = stackIndex;
        topFeature = candidate as OLFeature<Geometry>;
      }
      return false;
    },
    { hitTolerance: 3 },
  );

  return topFeature;
};